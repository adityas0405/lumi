import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parsePatch } from "../src/diff";
import type { FileChange, TestCaseResult } from "../src/schemas";
import {
  riskScore,
  routeFromSignals,
  stricter,
  type TriageInput,
  triageRules,
} from "../src/triage";

const fixture = (name: string) =>
  readFileSync(new URL(`./fixtures/${name}.patch`, import.meta.url), "utf8");

function file(
  path: string,
  additions: number,
  deletions: number,
  over: Partial<FileChange> = {},
): FileChange {
  return {
    path,
    previousPath: null,
    status: "modified",
    additions,
    deletions,
    binary: false,
    withheld: false,
    withheldReason: null,
    ...over,
  };
}

function input(over: Partial<TriageInput> = {}): TriageInput {
  return {
    files: [],
    hunks: [],
    tests: [],
    ci: [{ name: "unit-tests", conclusion: "success", url: null, summary: null }],
    ciPending: false,
    secretFindings: [],
    agentClaim: "",
    ...over,
  };
}

const rules = (i: TriageInput) => triageRules(i).map((s) => s.rule);

describe("triageRules on the planted refund bug", () => {
  const hunks = [
    ...parsePatch("src/payments/refunds.ts", fixture("refunds")),
    ...parsePatch("src/payments/refunds.test.ts", fixture("refunds-test")),
  ];
  const signals = triageRules(
    input({
      files: [file("src/payments/refunds.ts", 27, 5), file("src/payments/refunds.test.ts", 22, 1)],
      hunks,
      tests: [
        {
          name: "refund > marks the order refunded when the full amount is returned",
          suite: "src/payments/refunds.test.ts",
          status: "skipped",
          durationMs: null,
          message: null,
        },
      ],
    }),
  );

  it("flags the skipped test, the boundary change and the payments path", () => {
    const byRule = Object.fromEntries(signals.map((s) => [s.rule, s]));
    expect(byRule["test-skipped"]?.severity).toBe("review");
    expect(byRule["boundary-change"]).toMatchObject({ severity: "review" });
    expect(byRule["boundary-change"]!.message).toContain('">" to ">="');
    expect(byRule["sensitive-path"]!.message).toContain("payments");
    expect(routeFromSignals(signals)).toBe("needs_human");
    expect(riskScore(signals)).toBeGreaterThan(0.9);
  });

  it("points each signal at the exact line", () => {
    const skip = signals.find((s) => s.rule === "test-skipped")!;
    expect(skip.refs[0]).toMatch(/^diff:src\/payments\/refunds\.test\.ts#L(\d+)-L\1$/);
    const boundary = signals.find((s) => s.rule === "boundary-change")!;
    expect(boundary.refs[0]).toMatch(/^diff:src\/payments\/refunds\.ts#L\d+-L\d+$/);
  });
});

describe("triageRules", () => {
  it("blocks on failing tests and secrets", () => {
    const failing: TestCaseResult = {
      name: "x",
      suite: null,
      status: "failed",
      durationMs: 1,
      message: "boom",
    };
    expect(routeFromSignals(triageRules(input({ tests: [failing] })))).toBe("block");
    const secret = input({
      secretFindings: [{ kind: "github-token", preview: "ghp_…abcd", ref: "diff:a.ts#L1-L1" }],
    });
    expect(triageRules(secret)[0]).toMatchObject({ rule: "secret", severity: "block" });
  });

  it("treats a CI job that never started as no CI, not as failing", () => {
    const ci = [
      {
        name: "unit-tests",
        conclusion: "cancelled" as const,
        url: null,
        summary: "CI never started: billing",
      },
    ];
    const signals = triageRules(input({ ci }));
    expect(signals.map((s) => s.rule)).toEqual(["ci-not-run"]);
    expect(routeFromSignals(signals)).toBe("needs_human");
  });

  it("flags non-null assertions in the shipping-zone change", () => {
    const hunks = parsePatch("src/checkout/shipping.ts", fixture("shipping"));
    const signals = triageRules(
      input({
        files: [
          file("src/checkout/shipping.ts", 20, 2),
          file("src/checkout/shipping.test.ts", 30, 0, { status: "added" }),
        ],
        hunks,
      }),
    );
    expect(signals.find((s) => s.rule === "non-null-assertion")?.message).toContain(
      "SHIPPING_ZONES[region]!.zone",
    );
    expect(routeFromSignals(signals)).toBe("auto_pass");
  });

  it("detects new dependencies but not version bumps", () => {
    const hunks = parsePatch("package.json", fixture("package-json"));
    const signals = triageRules(
      input({ files: [file("package.json", 1, 0), file("package-lock.json", 40, 3)], hunks }),
    );
    expect(signals.find((s) => s.rule === "new-dependency")?.message).toBe(
      "New dependency: date-fns",
    );
    const bump = parsePatch(
      "package.json",
      '@@ -1,3 +1,3 @@\n {\n-  "react": "^19.2.0",\n+  "react": "^19.3.0",\n }',
    );
    expect(rules(input({ files: [file("package.json", 1, 1)], hunks: bump }))).not.toContain(
      "new-dependency",
    );
  });

  it("flags source changes without tests, and large changes", () => {
    expect(rules(input({ files: [file("src/a.ts", 10, 2)] }))).toContain("no-tests");
    expect(
      rules(input({ files: [file("src/a.ts", 10, 2), file("src/a.test.ts", 5, 0)] })),
    ).not.toContain("no-tests");
    expect(
      rules(input({ files: [file("src/a.ts", 500, 20), file("src/a.test.ts", 5, 0)] })),
    ).toContain("large-change");
  });

  it("ignores generated files for size and docs for missing tests", () => {
    expect(
      rules(input({ files: [file("package-lock.json", 5000, 200), file("README.md", 40, 3)] })),
    ).toEqual([]);
  });

  it("notices when the agent says it is unsure", () => {
    expect(rules(input({ agentClaim: "## What I'm unsure about\n- existing orders" }))).toContain(
      "agent-uncertain",
    );
  });

  it("picks the stricter route", () => {
    expect(stricter("auto_pass", "needs_human")).toBe("needs_human");
    expect(stricter("block", "needs_human")).toBe("block");
  });
});
