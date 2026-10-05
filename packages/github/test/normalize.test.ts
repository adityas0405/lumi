import { describe, expect, it } from "vitest";
import { parseJunit } from "../src/junit";
import { normalizePullRequest, type RawPullRequest } from "../src/normalize";

const JUNIT = `<?xml version="1.0" encoding="UTF-8" ?>
<testsuites name="vitest tests" tests="3" failures="0" errors="0" time="0.01">
  <testsuite name="src/payments/refunds.test.ts" tests="3" failures="0" errors="0" skipped="1" time="0.004">
    <testcase classname="src/payments/refunds.test.ts" name="refund &gt; applies a partial refund" time="0.001"></testcase>
    <testcase classname="src/payments/refunds.test.ts" name="refund &gt; marks the order refunded when the full amount is returned" time="0">
      <skipped/>
    </testcase>
    <testcase classname="src/payments/refunds.test.ts" name="refund &gt; rejects fractional cents" time="0.001">
      <failure message="expected to throw">AssertionError: expected to throw</failure>
    </testcase>
  </testsuite>
  <testsuite name="src/checkout/cart.test.ts" tests="1">
    <testcase classname="src/checkout/cart.test.ts" name="cart &gt; merges quantities" time="0.001"></testcase>
  </testsuite>
</testsuites>`;

const token = `ghp_${"Zx9Yw8Vu7T".repeat(4)}`;

const raw = (over: Partial<RawPullRequest> = {}): RawPullRequest => ({
  repoFullName: "acme/checkout",
  pr: {
    number: 7,
    html_url: "https://github.com/acme/checkout/pull/7",
    title: "Harden refund validation",
    body: `Does the thing. Debug token: ${token}`,
    state: "open",
    merged_at: null,
    merge_commit_sha: null,
    created_at: "2026-09-27T16:40:00Z",
    user: { login: "adityas0405" },
    head: { ref: "devin/harden-refund-validation", sha: "abc" },
    base: { ref: "main", sha: "def" },
    labels: [{ name: "agent: devin" }, { name: "payments" }],
  },
  files: [
    {
      filename: "src/payments/refunds.ts",
      status: "modified",
      additions: 2,
      deletions: 1,
      patch:
        "@@ -30,3 +30,4 @@\n   assertCents(amountCents);\n-  if (amountCents > refundableCents(order)) {\n+  if (order.refundedCents + amountCents >= order.capturedCents) {\n+    // guard\n   throw",
    },
    {
      filename: "src/payments/refunds.test.ts",
      status: "modified",
      additions: 1,
      deletions: 1,
      patch: '@@ -18 +18 @@\n-  it("x")\n+  it.skip("x")',
    },
    {
      filename: "package-lock.json",
      status: "modified",
      additions: 300,
      deletions: 10,
      patch: "@@ -1 +1 @@\n-a\n+b",
    },
    {
      filename: ".env",
      status: "added",
      additions: 1,
      deletions: 0,
      patch: "@@ -0,0 +1 @@\n+SECRET=abc",
    },
  ],
  commits: [
    { message: "second", authorDate: "2026-09-27T16:30:00Z", committerDate: null },
    { message: "first", authorDate: "2026-09-27T16:21:00Z", committerDate: null },
  ],
  ci: {
    pending: false,
    steps: [{ name: "unit-tests", conclusion: "success", url: null, summary: null }],
    tests: parseJunit(JUNIT),
  },
  ...over,
});

describe("parseJunit", () => {
  it("reads passed, skipped and failed cases with their suite", () => {
    const tests = parseJunit(JUNIT);
    expect(tests.map((t) => t.status)).toEqual(["passed", "skipped", "failed", "passed"]);
    expect(tests[0]).toMatchObject({
      name: "refund > applies a partial refund",
      suite: "src/payments/refunds.test.ts",
    });
    expect(tests[2]!.message).toBe("expected to throw");
  });
});

describe("normalizePullRequest", () => {
  const { task, secretFindings } = normalizePullRequest(raw());
  const refsOf = (kind: string) => task.evidence.filter((e) => e.kind === kind).map((e) => e.ref);

  it("detects the agent and uses the first commit as the start time", () => {
    expect(task.agent).toBe("devin");
    expect(task.agentDetection).toBe('label "agent: devin"');
    expect(task.occurredAt).toBe("2026-09-27T16:21:00Z");
    expect(task.externalId).toBe("github:acme/checkout#7");
  });

  it("redacts secrets in the agent's claim and records the finding", () => {
    expect(task.agentClaim).not.toContain(token);
    expect(secretFindings.some((f) => f.kind === "github-token" && f.ref === "claim:pr-body")).toBe(
      true,
    );
  });

  it("never reads secrets files or generated files into evidence", () => {
    expect(refsOf("diff_hunk")).toEqual([
      "diff:src/payments/refunds.ts#L30-L33",
      "diff:src/payments/refunds.test.ts#L18-L18",
    ]);
    const env = task.files.find((f) => f.path === ".env")!;
    expect(env).toMatchObject({
      withheld: true,
      withheldReason: "secrets file: contents never read",
    });
    expect(task.files.find((f) => f.path === "package-lock.json")!.withheldReason).toBe(
      "generated file",
    );
    expect(secretFindings.some((f) => f.kind === "secrets-file")).toBe(true);
  });

  it("keeps tests from changed test files plus failing and skipped ones", () => {
    expect(refsOf("test_case")).toEqual([
      "test:refund > applies a partial refund",
      "test:refund > marks the order refunded when the full amount is returned",
      "test:refund > rejects fractional cents",
    ]);
    const summary = task.evidence.find((e) => e.ref === "ci:tests")!;
    expect(summary.title).toBe("Test run: 2 passed, 1 failed, 1 skipped");
  });

  it("adds orientation evidence: the task, README, surrounding code and module map", () => {
    const withContext = normalizePullRequest(
      raw({
        context: {
          issues: [
            {
              number: 12,
              title: "Prevent over-refunds",
              body: "Support saw double refunds.",
              url: "https://x/12",
              author: "support-lead",
              authorName: "Sam Reyes",
            },
          ],
          readme: { path: "README.md", text: "# Checkout\nAll money is integer cents." },
          baseFiles: [{ path: "src/payments/refunds.ts", content: "a\nb\nc\n" }],
          sourceFiles: [
            { path: "src/payments/refunds.ts", content: 'import { assertCents } from "../money";' },
            { path: "src/money.ts", content: "export const x = 1;" },
          ],
        },
      }),
    ).task;
    const byKind = (k: string) =>
      withContext.evidence.filter((e) => e.kind === k).map((e) => e.ref);
    expect(byKind("task")).toEqual(["task:12"]);
    const request = withContext.evidence.find((e) => e.kind === "task")!;
    expect(request.payload).toMatchObject({
      requestedBy: "support-lead",
      requestedByName: "Sam Reyes",
    });
    expect(byKind("doc")).toEqual(["doc:README.md"]);
    expect(byKind("code")).toEqual(["code:src/payments/refunds.ts#L1-L3"]);
    const map = withContext.evidence.find((e) => e.kind === "module_map")!;
    expect(map.payload).toMatchObject({ edges: [{ from: "src/payments", to: "src" }] });
  });

  it("marks merged pull requests", () => {
    const merged = normalizePullRequest(
      raw({ pr: { ...raw().pr, state: "closed", merged_at: "2026-09-28T08:00:00Z" } }),
    );
    expect(merged.task.state).toBe("merged");
    expect(merged.task.reverts).toBeNull();
  });

  it("links a revert to the change it undoes", () => {
    const revert = normalizePullRequest(
      raw({
        pr: {
          ...raw().pr,
          title: 'Revert "Zone rates"',
          body: "Rolls back #52, the suspected cause.",
        },
        commits: [
          {
            message: 'Revert "Zone rates"\n\nThis reverts commit 7797dda1f0c2.',
            authorDate: "2026-09-29T10:00:00Z",
            committerDate: null,
          },
        ],
      }),
    );
    expect(revert.task.reverts).toEqual({ shas: ["7797dda1f0c2"], prNumbers: [52] });
  });
});

import { reviewBody } from "../src/reviews";

describe("reviewBody", () => {
  it("attributes the decision and mentions the agent only when it has work to do", () => {
    const changes = reviewBody({
      kind: "request_changes",
      decidedBy: "ada",
      feedback: "Add a test for refunds over the limit.",
      mention: "@claude",
      lumiUrl: "https://lumi.test/tasks/1",
    });
    expect(changes).toContain("**Changes requested** in Lumi by @ada.");
    expect(changes).toContain("Add a test for refunds over the limit.");
    expect(changes).toContain("@claude please address the feedback above.");
    const approve = reviewBody({
      kind: "approve",
      decidedBy: "ada",
      feedback: null,
      mention: "@claude",
      lumiUrl: null,
    });
    expect(approve).toBe("**Approved** in Lumi by @ada.");
  });
});
