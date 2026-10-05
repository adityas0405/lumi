import { describe, expect, it } from "vitest";
import { parsePatch } from "../src/diff";
import type { Evidence } from "../src/schemas";
import {
  planChapters,
  resolveRef,
  type Sentence,
  type TaskScript,
  validateScript,
} from "../src/script";

const hunk = parsePatch("src/tax.ts", "@@ -10,3 +10,4 @@\n a\n-b\n+c\n+d\n e")[0]!;
const evidence: Evidence[] = [
  {
    ref: "diff:src/tax.ts#L10-L13",
    kind: "diff_hunk",
    title: "",
    payload: { kind: "diff_hunk", hunk },
    blobPath: null,
  },
  {
    ref: "test:tax > rounds half-even",
    kind: "test_case",
    title: "",
    payload: {
      kind: "test_case",
      test: {
        name: "tax > rounds half-even",
        suite: "src/tax.test.ts",
        status: "passed",
        durationMs: 1,
        message: null,
      },
    },
    blobPath: null,
  },
  {
    ref: "claim:pr-body",
    kind: "agent_claim",
    title: "",
    payload: { kind: "agent_claim", text: "Finance asked for this." },
    blobPath: null,
  },
];

let n = 0;
const s = (over: Partial<Sentence> = {}): Sentence => ({
  id: `s${++n}`,
  technical: "taxFor now rounds exact half cents to the even neighbour instead of up.",
  plain: "Tax on some orders will be one cent lower, matching the payment processor.",
  refs: ["diff:src/tax.ts#L11-L12"],
  confidence: "confident",
  attributedToAgent: false,
  scene: "diff",
  ...over,
});

const script = (over: Partial<TaskScript> = {}): TaskScript => ({
  headline: "Tax rounding switches to half-even",
  summary: { technical: "t", plain: "p" },
  businessImpact: "Totals match the processor report.",
  chapters: [
    { id: "c1", kind: "what_changed", title: "What changed", sentences: [s(), s()] },
    {
      id: "c2",
      kind: "why",
      title: "Why",
      sentences: [
        s({
          refs: ["claim:pr-body"],
          attributedToAgent: true,
          confidence: "uncertain",
          scene: "claim",
        }),
      ],
    },
    {
      id: "c3",
      kind: "how_checked",
      title: "How it was checked",
      sentences: [s({ refs: ["test:tax > rounds half-even"], scene: "tests" })],
    },
    {
      id: "c4",
      kind: "uncertain",
      title: "What's uncertain",
      sentences: [s({ confidence: "uncertain", scene: "uncertain" })],
    },
    { id: "c5", kind: "decision", title: "Decision", sentences: [s({ scene: "decision" })] },
  ],
  decision: {
    question: "Ship it?",
    recommendation: "needs_discussion",
    reason: "Finance must confirm.",
  },
  ...over,
});

const ctx = { evidence, requireUncertainty: true, minWords: 10, maxWords: 480 };
const messages = (t: TaskScript, c = ctx) => validateScript(t, c).map((i) => i.message);

describe("resolveRef", () => {
  it("resolves exact refs, diff sub-ranges and test names", () => {
    expect(resolveRef("diff:src/tax.ts#L11-L12", evidence)?.ref).toBe("diff:src/tax.ts#L10-L13");
    expect(resolveRef("diff:src/tax.ts#L9-L12", evidence)).toBeNull();
    expect(resolveRef("test:src/tax.test.ts > tax > rounds half-even", evidence)?.kind).toBe(
      "test_case",
    );
    expect(resolveRef("ci:nope", evidence)).toBeNull();
  });
});

describe("validateScript", () => {
  it("accepts a well-formed script", () => {
    expect(validateScript(script(), ctx)).toEqual([]);
  });

  it("rejects sentences without evidence or with unknown refs", () => {
    const bad = script();
    bad.chapters[0]!.sentences[0]!.refs = [];
    bad.chapters[0]!.sentences[1]!.refs = ["diff:src/other.ts#L1-L2"];
    const m = messages(bad);
    expect(m.some((x) => x.includes("has no evidence ref"))).toBe(true);
    expect(m.some((x) => x.includes("not in the evidence list"))).toBe(true);
  });

  it("refuses to state the agent's claim as fact", () => {
    const bad = script();
    bad.chapters[1]!.sentences[0] = s({
      refs: ["claim:pr-body"],
      attributedToAgent: false,
      confidence: "confident",
    });
    const m = messages(bad);
    expect(m.some((x) => x.includes("only by the agent's own description"))).toBe(true);
    expect(m.some((x) => x.includes('cannot be "confident"'))).toBe(true);
  });

  it("rejects refs and line anchors in spoken text", () => {
    const bad = script();
    bad.chapters[0]!.sentences[0]!.technical = "The guard is wrong. [diff:src/tax.ts#L11-L12]";
    bad.chapters[0]!.sentences[1]!.plain = "See line #L41 for details.";
    expect(messages(bad).filter((x) => x.includes("read aloud"))).toHaveLength(2);
  });

  it("requires screenshots to be shown when they exist", () => {
    const shot: Evidence = {
      ref: "shot:checkout@after",
      kind: "screenshot",
      title: "",
      payload: {
        kind: "screenshot",
        label: "checkout",
        variant: "after",
        width: 10,
        height: 10,
        highlight: null,
      },
      blobPath: "/x.png",
    };
    const withShot = { ...ctx, evidence: [...evidence, shot] };
    expect(messages(script(), withShot).some((x) => x.includes("screenshots exist"))).toBe(true);
    const shows = script();
    shows.chapters[0]!.sentences[0]!.refs = ["shot:checkout@after"];
    expect(messages(shows, withShot).some((x) => x.includes("screenshots exist"))).toBe(false);
  });

  it("requires a context chapter for non-trivial changes and keeps it first and short", () => {
    const needs = { ...ctx, requireContext: true };
    expect(messages(script(), needs).some((x) => x.includes('Missing a "context" chapter'))).toBe(
      true,
    );
    const withContext = script();
    withContext.chapters.unshift({
      id: "c0",
      kind: "context",
      title: "Context",
      sentences: [s(), s()],
    });
    expect(messages(withContext, needs)).toEqual([]);
    const late = script();
    late.chapters.push({ id: "c9", kind: "context", title: "Context", sentences: [s()] });
    expect(messages(late, needs).some((x) => x.includes("out of order"))).toBe(true);
    const long = script();
    long.chapters.unshift({
      id: "c0",
      kind: "context",
      title: "Context",
      sentences: Array.from({ length: 6 }, () => s()),
    });
    expect(messages(long, needs).some((x) => x.includes("at most 5"))).toBe(true);
  });

  it("resolves code refs inside surrounding-code evidence", () => {
    const code: Evidence = {
      ref: "code:src/tax.ts#L1-L40",
      kind: "code",
      title: "",
      payload: {
        kind: "code",
        path: "src/tax.ts",
        startLine: 1,
        lines: Array.from({ length: 40 }, () => "x"),
      },
      blobPath: null,
    };
    expect(resolveRef("code:src/tax.ts#L12-L18", [code])?.ref).toBe(code.ref);
    expect(resolveRef("code:src/tax.ts#L39-L41", [code])).toBeNull();
  });

  it("reserves the claim scene for the agent's own words", () => {
    const bad = script();
    bad.chapters[1]!.sentences[0] = s({ scene: "claim" });
    expect(messages(bad).some((x) => x.includes("isn't the agent's own words"))).toBe(true);
  });

  it("keeps the decision in the narrator's voice", () => {
    const bad = script();
    bad.chapters[4]!.sentences[0] = s({
      refs: ["claim:pr-body"],
      attributedToAgent: true,
      confidence: "uncertain",
      scene: "decision",
    });
    expect(
      messages(bad).some((x) => x.includes("decision chapter is Lumi's own recommendation")),
    ).toBe(true);
  });

  it("requires the uncertainty chapter when there are open risks", () => {
    const noUncertain = script({
      chapters: script().chapters.filter((c) => c.kind !== "uncertain"),
    });
    expect(messages(noUncertain).some((x) => x.includes('Missing an "uncertain" chapter'))).toBe(
      true,
    );
    expect(messages(noUncertain, { ...ctx, requireUncertainty: false })).toEqual([]);
  });

  it("enforces chapter order and length limits", () => {
    const reordered = script();
    reordered.chapters.reverse();
    expect(messages(reordered).some((x) => x.includes("out of order"))).toBe(true);
    expect(
      messages(script(), { ...ctx, minWords: 1000 }).some((x) => x.includes("needs at least")),
    ).toBe(true);
    const long = script();
    long.chapters[0]!.sentences[0]!.technical = "word ".repeat(50);
    expect(messages(long).some((x) => x.includes("too long to narrate"))).toBe(true);
  });
});

describe("planChapters", () => {
  it("keeps chapters under the line budget and groups by directory", () => {
    const plan = planChapters([
      { path: "src/orders/filters.ts", additions: 90, deletions: 0 },
      { path: "src/orders/filters.test.ts", additions: 80, deletions: 0 },
      { path: "src/orders/pagination.ts", additions: 100, deletions: 0 },
      { path: "src/orders/history.ts", additions: 60, deletions: 20 },
      { path: "src/ui/OrderHistory.tsx", additions: 180, deletions: 0 },
      { path: "src/ui/order-history.css", additions: 70, deletions: 0 },
      { path: "package-lock.json", additions: 900, deletions: 0 },
    ]);
    expect(plan.every((c) => c.lines <= 400)).toBe(true);
    expect(plan.flatMap((c) => c.files)).not.toContain("package-lock.json");
    expect(plan.reduce((n, c) => n + c.lines, 0)).toBe(600);
    expect(plan[0]!.files[0]).toBe("src/orders/filters.ts");
  });
});

describe("verdict chapter", () => {
  const withVerdict = (sentences: Sentence[]): TaskScript => {
    const base = script();
    return {
      ...base,
      chapters: [{ id: "v", kind: "verdict", title: "Verdict", sentences }, ...base.chapters],
    };
  };
  const problem = { ...ctx, verdict: { problemRefs: ["diff:src/tax.ts#L12-L12"] } };
  const clean = { ...ctx, verdict: { problemRefs: null } };
  const what = s({ technical: "Devin's change hardens refund validation.", scene: "title" });
  const shows = s({
    technical: "The new guard rejects exact full refunds.",
    refs: ["diff:src/tax.ts#L11-L12"],
  });
  const recommend = s({ technical: "Lumi recommends requesting changes.", scene: "decision" });

  it("accepts a problem verdict: what it does, the problem on its code, the recommendation", () => {
    expect(
      messages(withVerdict([what, shows, recommend]), problem).filter((m) => /verdict/i.test(m)),
    ).toEqual([]);
  });

  it("requires the problem sentence to cite the finding's lines", () => {
    const elsewhere = s({
      technical: "Something else changed.",
      refs: ["test:tax > rounds half-even"],
      scene: "tests",
    });
    expect(
      messages(withVerdict([what, elsewhere, recommend]), problem).some((m) =>
        m.includes("must cite the lines"),
      ),
    ).toBe(true);
  });

  it("requires the verdict first and three sentences for a problem", () => {
    expect(
      messages(script(), problem).some((m) =>
        m.includes('Open with exactly one "verdict" chapter'),
      ),
    ).toBe(true);
    expect(
      messages(withVerdict([what, shows]), problem).some((m) =>
        m.includes("exactly three sentences"),
      ),
    ).toBe(true);
  });

  it("gives a clean change one short 'No problems found' line", () => {
    const ok = s({
      technical: "No problems found. One thing worth a look: the cache timeout.",
      scene: "title",
    });
    expect(messages(withVerdict([ok]), clean).filter((m) => /verdict|No problems/.test(m))).toEqual(
      [],
    );
    const wrong = s({
      technical:
        "This change looks fine overall and it passes every single check that we ran on it today.",
      scene: "title",
    });
    const m = messages(withVerdict([wrong]), clean);
    expect(m.some((x) => x.includes('starts "No problems found"'))).toBe(true);
    expect(m.some((x) => x.includes("too long"))).toBe(true);
  });

  it("allows the decision scene in the verdict", () => {
    expect(
      messages(withVerdict([what, shows, recommend]), problem).some((m) =>
        m.includes("decision scene outside"),
      ),
    ).toBe(false);
  });
});
