import { hunkRange } from "./diff";
import { isGeneratedFile, isTestFile } from "./files";
import { refs } from "./refs";
import type { CiStep, DiffHunk, FileChange, TestCaseResult } from "./schemas";

export type Severity = "info" | "review" | "block";

export interface TriageSignal {
  rule: string;
  severity: Severity;
  message: string;
  refs: string[];
  /** Contribution to the risk score (0–1 scale, summed then clamped). */
  weight: number;
}

export interface TriageInput {
  files: FileChange[];
  hunks: DiffHunk[];
  tests: TestCaseResult[];
  ci: CiStep[];
  ciPending: boolean;
  secretFindings: { kind: string; preview: string; ref: string }[];
  agentClaim: string;
}

export interface SensitiveArea {
  name: string;
  pattern: RegExp;
}

export const DEFAULT_SENSITIVE_AREAS: SensitiveArea[] = [
  {
    name: "payments",
    pattern: /(^|\/)(payments?|billing|refunds?|invoic\w*|charges?|stripe|tax)(\/|\.|$)/i,
  },
  { name: "auth", pattern: /(^|\/)(auth\w*|login|session|permissions?|oauth|sso|rbac)(\/|\.|$)/i },
  { name: "database migrations", pattern: /(^|\/)(migrations?|schema\.sql|drizzle\/\d+)/i },
  {
    name: "infrastructure",
    pattern: /(^|\/)(infra|terraform|k8s|helm|\.github\/workflows|Dockerfile|docker-compose)/i,
  },
  { name: "security", pattern: /(^|\/)(crypto|secrets?|security|csp|cors)(\/|\.|$)/i },
];

/** Changed lines in one video before Lumi splits it into chapters (human review limit). */
export const REVIEW_LINE_BUDGET = 400;

const SKIP_TEST =
  /\b(?:it|test|describe)\.(?:skip|todo)\s*\(|\bx(?:it|describe|test)\s*\(|@pytest\.mark\.skip|@unittest\.skip|\bt\.Skip\(/;
const TEST_DECL = /\b(?:it|test)\s*\(\s*["'`]/;
const COMPARISON = /(?<![=!<>])(>=|<=|>|<)(?![=>])/g;
const UNSURE =
  /\b(unsure|not sure|couldn'?t (?:find|tell|confirm|verify)|can'?t tell|not verified|haven'?t (?:tested|verified)|i think|open questions?|todo)\b/i;

function sensitiveArea(path: string, areas: SensitiveArea[]): string | null {
  return areas.find((a) => a.pattern.test(path))?.name ?? null;
}

function operators(line: string): string[] {
  return [...line.matchAll(COMPARISON)].map((m) => m[1]!);
}

/** Replaces comparison operators with a placeholder to detect "same line, different boundary". */
function withoutOperators(line: string): string {
  return line.replace(COMPARISON, "⋈").replace(/\s+/g, " ").trim();
}

/**
 * Deterministic risk signals. The Claude reviewer sees these alongside the diff;
 * the final route is the stricter of the two, so a model miss can't wave through
 * failing CI, a leaked secret or a skipped test.
 */
export function triageRules(input: TriageInput, areas = DEFAULT_SENSITIVE_AREAS): TriageSignal[] {
  const signals: TriageSignal[] = [];
  const reviewable = input.files.filter((f) => !isGeneratedFile(f.path) && !f.withheld);
  const changedLines = reviewable.reduce((n, f) => n + f.additions + f.deletions, 0);
  const sourceFiles = reviewable.filter(
    (f) => !isTestFile(f.path) && !/\.(md|mdx|txt)$/i.test(f.path),
  );
  const testFiles = reviewable.filter((f) => isTestFile(f.path));

  // Secrets: always block.
  if (input.secretFindings.length > 0) {
    const kinds = [...new Set(input.secretFindings.map((f) => f.kind))].join(", ");
    signals.push({
      rule: "secret",
      severity: "block",
      message: `Possible secret committed (${kinds}). Values are redacted from all evidence.`,
      refs: [...new Set(input.secretFindings.map((f) => f.ref))],
      weight: 1,
    });
  }

  // CI.
  const failedSteps = input.ci.filter(
    (s) => s.conclusion === "failure" || s.conclusion === "timed_out",
  );
  const failedTests = input.tests.filter((t) => t.status === "failed");
  if (failedSteps.length || failedTests.length) {
    signals.push({
      rule: "ci-failing",
      severity: "block",
      message: failedTests.length
        ? `${failedTests.length} failing test${failedTests.length > 1 ? "s" : ""}`
        : `CI failed: ${failedSteps.map((s) => s.name).join(", ")}`,
      refs: [
        ...failedTests.map((t) => refs.test(t.name)),
        ...failedSteps.map((s) => refs.ci(s.name)),
      ].slice(0, 8),
      weight: 0.9,
    });
  } else if (
    input.ci.length > 0 &&
    input.tests.length === 0 &&
    input.ci.every((s) => s.conclusion === "cancelled" || s.conclusion === "skipped")
  ) {
    signals.push({
      rule: "ci-not-run",
      severity: "review",
      message: "CI never ran on this change, so no tests have been run",
      refs: input.ci.map((s) => refs.ci(s.name)).slice(0, 3),
      weight: 0.3,
    });
  } else if (input.ciPending) {
    signals.push({
      rule: "ci-pending",
      severity: "info",
      message: "CI is still running",
      refs: [],
      weight: 0.05,
    });
  } else if (input.ci.length === 0 && sourceFiles.length > 0) {
    signals.push({
      rule: "ci-missing",
      severity: "review",
      message: "No CI ran on this change",
      refs: [],
      weight: 0.3,
    });
  }

  // Sensitive areas.
  const touched = new Map<string, string[]>();
  for (const f of reviewable) {
    const area = sensitiveArea(f.path, areas);
    if (area) touched.set(area, [...(touched.get(area) ?? []), f.path]);
  }
  for (const [area, paths] of touched) {
    signals.push({
      rule: "sensitive-path",
      severity: "review",
      message: `Touches ${area} code (${paths.length} file${paths.length > 1 ? "s" : ""})`,
      refs: paths.map((p) => refs.file(p)),
      weight: 0.35,
    });
  }

  // Size.
  if (changedLines > REVIEW_LINE_BUDGET) {
    signals.push({
      rule: "large-change",
      severity: "review",
      message: `${changedLines} changed lines, above the ${REVIEW_LINE_BUDGET}-line review limit; the video is split into chapters`,
      refs: [],
      weight: changedLines > 2 * REVIEW_LINE_BUDGET ? 0.3 : 0.2,
    });
  }

  // Tests.
  if (sourceFiles.length > 0 && testFiles.length === 0) {
    signals.push({
      rule: "no-tests",
      severity: "review",
      message: "Source code changed without any test changes",
      refs: sourceFiles.slice(0, 5).map((f) => refs.file(f.path)),
      weight: 0.25,
    });
  }

  for (const hunk of input.hunks) {
    const { start, end } = hunkRange(hunk);
    const ref = refs.diff(hunk.file, start, end);
    const added = hunk.lines.filter((l) => l.type === "add");
    const removed = hunk.lines.filter((l) => l.type === "del");

    const skipped = added.filter((l) => SKIP_TEST.test(l.text));
    if (skipped.length) {
      const line = skipped[0]!.newLine ?? start;
      signals.push({
        rule: "test-skipped",
        severity: "review",
        message: `A test was disabled (${skipped[0]!.text.trim().slice(0, 80)})`,
        refs: [refs.diff(hunk.file, line, line)],
        weight: 0.45,
      });
    }

    const removedTests = removed.filter(
      (l) => TEST_DECL.test(l.text) && !SKIP_TEST.test(l.text),
    ).length;
    const addedTests = added.filter((l) => TEST_DECL.test(l.text) || SKIP_TEST.test(l.text)).length;
    if (removedTests > addedTests) {
      signals.push({
        rule: "test-deleted",
        severity: "review",
        message: `${removedTests - addedTests} test${removedTests - addedTests > 1 ? "s" : ""} removed`,
        refs: [ref],
        weight: 0.4,
      });
    }

    // Boundary changes: the same line with a different comparison operator.
    const area = sensitiveArea(hunk.file, areas);
    if (!isTestFile(hunk.file)) {
      for (const del of removed) {
        const delOps = operators(del.text);
        if (delOps.length === 0) continue;
        const match = added.find(
          (a) =>
            operators(a.text).length > 0 &&
            operators(a.text).join() !== delOps.join() &&
            (withoutOperators(a.text) === withoutOperators(del.text) ||
              sharedIdentifiers(a.text, del.text) >= 2),
        );
        if (match) {
          const line = match.newLine ?? start;
          signals.push({
            rule: "boundary-change",
            severity: area ? "review" : "info",
            message: `Comparison changed from "${delOps.join(" ")}" to "${operators(match.text).join(" ")}"${area ? ` in ${area} code` : ""}`,
            refs: [refs.diff(hunk.file, line, line)],
            weight: area ? 0.3 : 0.1,
          });
          break;
        }
      }
    }

    // Non-null assertions hide missing-key cases that only fail in production.
    const assertions = added.filter((l) => /\w[\])]?!\.\w/.test(l.text) && !isTestFile(hunk.file));
    if (assertions.length) {
      const line = assertions[0]!.newLine ?? start;
      signals.push({
        rule: "non-null-assertion",
        severity: "info",
        message: `New non-null assertion: ${assertions[0]!.text.trim().slice(0, 80)}`,
        refs: [refs.diff(hunk.file, line, line)],
        weight: 0.1,
      });
    }
  }

  // New dependencies.
  for (const hunk of input.hunks.filter((h) => /(^|\/)package\.json$/.test(h.file))) {
    const removedNames = new Set(
      hunk.lines
        .filter((l) => l.type === "del")
        .map((l) => depName(l.text))
        .filter(Boolean),
    );
    const added = hunk.lines
      .filter((l) => l.type === "add")
      .map((l) => ({ l, name: depName(l.text) }))
      .filter((x) => x.name && !removedNames.has(x.name));
    if (added.length) {
      const line = added[0]!.l.newLine ?? hunk.newStart;
      signals.push({
        rule: "new-dependency",
        severity: "review",
        message: `New dependenc${added.length > 1 ? "ies" : "y"}: ${added.map((a) => a.name).join(", ")}`,
        refs: [refs.diff(hunk.file, line, line)],
        weight: 0.2,
      });
    }
  }

  if (UNSURE.test(input.agentClaim)) {
    signals.push({
      rule: "agent-uncertain",
      severity: "info",
      message: "The agent says it is unsure about part of this change",
      refs: [refs.claim()],
      weight: 0.1,
    });
  }

  return signals;
}

function depName(line: string): string | null {
  const m = /^\s*"(@?[\w./-]+)"\s*:\s*"[\^~<>=]?\d/.exec(line);
  return m ? m[1]! : null;
}

function sharedIdentifiers(a: string, b: string): number {
  const ids = (s: string) => new Set(s.match(/[A-Za-z_]\w{2,}/g) ?? []);
  const ia = ids(a);
  let n = 0;
  for (const id of ids(b)) if (ia.has(id)) n++;
  return n;
}

export function riskScore(signals: TriageSignal[]): number {
  return Math.min(
    1,
    signals.reduce((s, x) => s + x.weight, 0),
  );
}

export type Route = "auto_pass" | "needs_human" | "block";

export function routeFromSignals(signals: TriageSignal[]): Route {
  if (signals.some((s) => s.severity === "block")) return "block";
  if (signals.some((s) => s.severity === "review")) return "needs_human";
  return "auto_pass";
}

const ORDER: Route[] = ["auto_pass", "needs_human", "block"];

/** The stricter of two routes. */
export function stricter(a: Route, b: Route): Route {
  return ORDER.indexOf(a) >= ORDER.indexOf(b) ? a : b;
}
