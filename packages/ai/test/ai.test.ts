import type { Evidence, TaskScript, TriageSignal } from "@lumi/core";
import { parsePatch } from "@lumi/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { z } from "zod";

// The cache talks to Postgres; tests run the provider directly.
vi.mock("../src/cache", () => ({
  cachedJson: async (req: { schema: z.ZodType }, _opts?: unknown) => {
    const { getProvider } = await import("../src/config");
    const res = await getProvider().generateJson(req as never);
    return { ...res, cached: false };
  },
}));

const { setProvider } = await import("../src/config");
const { runTriage } = await import("../src/triage");
const { buildStory, requiresUncertainty } = await import("../src/story");
const { answerQuestion, answerDigestQuestion } = await import("../src/qa");

const hunk = parsePatch(
  "src/pay.ts",
  "@@ -1,2 +1,2 @@\n-if (a > b) x();\n+if (a >= b) x();\n ok",
)[0]!;
const evidence: Evidence[] = [
  {
    ref: "diff:src/pay.ts#L1-L2",
    kind: "diff_hunk",
    title: "",
    payload: { kind: "diff_hunk", hunk },
    blobPath: null,
  },
  {
    ref: "claim:pr-body",
    kind: "agent_claim",
    title: "",
    payload: { kind: "agent_claim", text: "Hardened the guard." },
    blobPath: null,
  },
];

function fakeProvider(responses: unknown[]) {
  const calls: { purpose: string; input: string }[] = [];
  setProvider({
    name: "fake",
    async generateJson(req) {
      calls.push({ purpose: req.purpose, input: req.input });
      const data = req.schema.parse(responses.shift());
      return {
        data,
        model: "fake-model",
        provider: "fake",
        usage: { inputTokens: 1, outputTokens: 1 },
      };
    },
  });
  return calls;
}

afterEach(() => setProvider(null));

describe("runTriage", () => {
  const ruleBlock: TriageSignal = {
    rule: "ci-failing",
    severity: "block",
    message: "1 failing test",
    refs: [],
    weight: 0.9,
  };

  it("never lets the model lower a rule-based route", async () => {
    fakeProvider([{ route: "auto_pass", summary: "fine", reasons: [], suspectedDefects: [] }]);
    const t = await runTriage({ title: "x", evidence, signals: [ruleBlock] });
    expect(t.route).toBe("block");
    expect(t.wouldAutoPass).toBe(false);
  });

  it("raises the route when the model finds a real defect, and drops invented refs", async () => {
    fakeProvider([
      {
        route: "auto_pass",
        summary: "boundary bug",
        reasons: [{ text: "r", refs: ["diff:src/pay.ts#L1-L1", "diff:src/nope.ts#L9-L9"] }],
        suspectedDefects: [
          {
            summary: "Off by one",
            explanation: "a == b now calls x()",
            refs: ["diff:src/pay.ts#L1-L1", "made:up"],
            severity: "high",
          },
        ],
      },
    ]);
    const t = await runTriage({ title: "x", evidence, signals: [] });
    expect(t.route).toBe("block");
    expect(t.verdict.suspectedDefects[0]!.refs).toEqual(["diff:src/pay.ts#L1-L1"]);
    expect(t.verdict.reasons[0]!.refs).toEqual(["diff:src/pay.ts#L1-L1"]);
    expect(t.score).toBeGreaterThan(0.4);
  });

  it("blocks only on grounded high-severity defects", async () => {
    const defect = (severity: string, refs: string[]) => ({
      route: "needs_human",
      summary: "s",
      reasons: [],
      suspectedDefects: [{ summary: "d", explanation: "e", refs, severity }],
    });
    fakeProvider([defect("medium", ["diff:src/pay.ts#L1-L1"]), defect("high", ["made:up"])]);
    expect((await runTriage({ title: "x", evidence, signals: [] })).route).toBe("needs_human");
    expect((await runTriage({ title: "y", evidence, signals: [] })).route).toBe("needs_human");
  });
});

const sentence = (over: Record<string, unknown> = {}) => ({
  id: "x",
  technical:
    "The guard now also fires when the amounts are exactly equal, which blocks the boundary case entirely here.",
  plain: "Some refunds that should work will now be refused.",
  refs: ["diff:src/pay.ts#L1-L1"],
  confidence: "confident",
  attributedToAgent: false,
  scene: "diff",
  ...over,
});
const goodScript = (): TaskScript =>
  ({
    headline: "Guard boundary changed",
    summary: { technical: "t", plain: "p" },
    businessImpact: "Refunds may fail.",
    chapters: [
      {
        id: "v",
        kind: "verdict",
        title: "Verdict",
        sentences: [
          sentence({
            technical: "No problems found.",
            plain: "No problems found.",
            scene: "title",
          }),
        ],
      },
      {
        id: "a",
        kind: "what_changed",
        title: "What changed",
        sentences: Array.from({ length: 5 }, () => sentence()),
      },
      {
        id: "b",
        kind: "how_checked",
        title: "Checks",
        sentences: Array.from({ length: 4 }, () => sentence({ scene: "tests" })),
      },
      {
        id: "c",
        kind: "uncertain",
        title: "Uncertain",
        sentences: [sentence({ confidence: "uncertain", scene: "uncertain" })],
      },
      {
        id: "d",
        kind: "decision",
        title: "Decision",
        sentences: [sentence({ scene: "decision" })],
      },
    ],
    decision: { question: "Merge?", recommendation: "request_changes", reason: "Boundary bug." },
  }) as TaskScript;

describe("buildStory", () => {
  it("feeds validation errors back and accepts the corrected script", async () => {
    const bad = goodScript();
    bad.chapters[0]!.sentences[0]!.refs = [];
    const calls = fakeProvider([bad, goodScript()]);
    const r = await buildStory({
      title: "x",
      agent: "devin",
      evidence,
      files: [],
      signals: [],
      verdict: null,
    });
    expect(r.attempts).toBe(2);
    expect(r.issues).toEqual([]);
    expect(calls[1]!.input).toContain("has no evidence ref");
    expect(r.script.chapters[0]!.sentences[0]!.id).toBe("c1.s1");
  });

  it("returns the last script with its issues after three failed attempts", async () => {
    const bad = goodScript();
    bad.chapters[0]!.sentences[0]!.refs = ["nope:1"];
    fakeProvider([bad, bad, bad]);
    const r = await buildStory({
      title: "x",
      agent: "devin",
      evidence,
      files: [],
      signals: [],
      verdict: null,
    });
    expect(r.attempts).toBe(3);
    expect(r.issues.length).toBeGreaterThan(0);
  });

  it("requires an uncertainty chapter when a test was skipped", () => {
    expect(
      requiresUncertainty(
        [{ rule: "test-skipped", severity: "review", message: "", refs: [], weight: 0 }],
        null,
      ),
    ).toBe(true);
    expect(
      requiresUncertainty(
        [{ rule: "sensitive-path", severity: "review", message: "", refs: [], weight: 0 }],
        null,
      ),
    ).toBe(false);
  });
});

describe("answerQuestion", () => {
  it("treats an answer without surviving citations as not in the evidence", async () => {
    fakeProvider([
      {
        notInEvidence: false,
        sentences: [{ text: "Because finance asked.", refs: ["made:up"], fromAgentClaim: false }],
      },
    ]);
    const a = await answerQuestion({ title: "x", question: "why?", evidence });
    expect(a.notInEvidence).toBe(true);
  });

  it("keeps grounded answers", async () => {
    fakeProvider([
      {
        notInEvidence: false,
        sentences: [
          {
            text: "The guard now includes equality.",
            refs: ["diff:src/pay.ts#L1-L1"],
            fromAgentClaim: false,
          },
        ],
      },
    ]);
    const a = await answerQuestion({ title: "x", question: "what changed?", evidence });
    expect(a.notInEvidence).toBe(false);
    expect(a.sentences[0]!.refs).toEqual(["diff:src/pay.ts#L1-L1"]);
  });
});

describe("answerDigestQuestion", () => {
  const brief = (taskId: string) => ({
    taskId,
    section: "decisions",
    agent: "Claude Code",
    prNumber: 2,
    title: "Refund guard",
    headline: "Full refunds are rejected",
    summary: "The guard uses >= instead of >.",
    defects: ["Off-by-one on full refunds"],
    recommendation: "request_changes",
    decidedAs: null,
    request: { ref: "task:12", title: "Prevent over-refunds", requestedBy: "ada" },
  });

  it("keeps citations to the digest's reviews and the watched task's evidence only", async () => {
    fakeProvider([
      {
        notInEvidence: false,
        sentences: [
          {
            text: "The refund change is riskiest.",
            refs: ["review:a", "review:zzz", "diff:src/pay.ts#L1-L2"],
            fromAgentClaim: false,
          },
        ],
      },
    ]);
    const unfocused = await answerDigestQuestion({ question: "riskiest?", briefs: [brief("a")] });
    expect(unfocused.sentences[0]!.refs).toEqual(["review:a"]);
    fakeProvider([
      {
        notInEvidence: false,
        sentences: [
          { text: "The guard changed.", refs: ["diff:src/pay.ts#L1-L2"], fromAgentClaim: false },
        ],
      },
    ]);
    const focused = await answerDigestQuestion({
      question: "what changed?",
      briefs: [brief("a")],
      focus: { taskId: "a", evidence },
    });
    expect(focused.sentences[0]!.refs).toEqual(["diff:src/pay.ts#L1-L2"]);
    expect(focused.notInEvidence).toBe(false);
  });
});
