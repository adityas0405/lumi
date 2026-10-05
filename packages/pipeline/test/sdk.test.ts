import { describe, expect, it } from "vitest";
import { normalizeSdkReport, SdkReport } from "../src/sdk";

describe("SDK reports", () => {
  it("validates and normalizes a report with every evidence kind", () => {
    const report = SdkReport.parse({
      task: {
        id: "run-42",
        title: "Fix flaky retry",
        agent: "claude-code",
        repo: "acme/api",
        description: "Retries now back off.",
      },
      evidence: [
        {
          kind: "diff",
          file: "src/retry.ts",
          patch: "@@ -1,2 +1,2 @@\n-const n = 3;\n+const n = 5;\n ok",
        },
        { kind: "test", name: "retry > backs off", status: "passed" },
        { kind: "ci", name: "build", conclusion: "success" },
        { kind: "log", source: "agent", text: 'Set API_TOKEN="abcdefghijklmnop1234" for the run' },
        {
          kind: "artifact",
          type: "video",
          url: "https://example.com/v.mp4",
          label: "Test run recording",
        },
      ],
    });
    const { task, secretFindings } = normalizeSdkReport(report);
    expect(task.externalId).toBe("sdk:acme/api:run-42");
    expect(task.agent).toBe("claude-code");
    expect(task.evidence.map((e) => e.ref)).toEqual([
      "claim:pr-body",
      "file:src/retry.ts",
      "diff:src/retry.ts#L1-L2",
      "test:retry > backs off",
      "ci:build",
      "log:agent",
      "artifact:1",
    ]);
    expect(task.additions).toBe(1);
    expect(secretFindings).toHaveLength(1);
    const log = task.evidence.find((e) => e.kind === "log")!;
    expect(JSON.stringify(log.payload)).not.toContain("abcdefghijklmnop1234");
  });

  it("records the agent's decisions with their alternatives", () => {
    const { task } = normalizeSdkReport(
      SdkReport.parse({
        task: { id: "s1", title: "t", agent: "claude-code", repo: "a/b", pullRequest: 24 },
        evidence: [
          {
            kind: "decision",
            title: "Rounding mode",
            chosen: "Half-even",
            alternatives: ["Half-up", "Truncate"],
            rationale: "Matches the processor.",
          },
        ],
      }),
    );
    const d = task.evidence.find((e) => e.kind === "decision")!;
    expect(d.ref).toBe("decision:1");
    expect(d.payload).toMatchObject({ chosen: "Half-even", alternatives: ["Half-up", "Truncate"] });
  });

  it("maps unknown agents to unknown but keeps the name", () => {
    const { task } = normalizeSdkReport(
      SdkReport.parse({
        task: { id: "1", title: "t", agent: "my-bot", repo: "a/b" },
        evidence: [],
      }),
    );
    expect(task.agent).toBe("unknown");
    expect(task.agentDetection).toContain("my-bot");
  });

  it("rejects malformed repos", () => {
    expect(() =>
      SdkReport.parse({ task: { id: "1", title: "t", agent: "x", repo: "nope" } }),
    ).toThrow();
  });
});
