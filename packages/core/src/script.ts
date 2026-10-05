import { z } from "zod";
import { hunkRange } from "./diff";
import { isGeneratedFile } from "./files";
import { parseRef } from "./refs";
import type { DiffHunk, Evidence } from "./schemas";
import { REVIEW_LINE_BUDGET } from "./triage";

/** Visual treatment the renderer uses while a sentence plays. */
export const SceneType = z.enum([
  "title",
  "diff",
  "tests",
  "ci",
  "screenshot",
  "before_after",
  "chart",
  "uncertain",
  "decision",
  "artifact",
  "claim",
  "files",
  "map",
  "task",
]);
export type SceneType = z.infer<typeof SceneType>;

export const ChapterKind = z.enum([
  "verdict",
  "context",
  "what_changed",
  "why",
  "how_checked",
  "uncertain",
  "decision",
]);
export type ChapterKind = z.infer<typeof ChapterKind>;

export const Sentence = z.object({
  id: z.string(),
  /** Narration for engineers. */
  technical: z.string(),
  /** Same point for a non-technical owner: what it means, no code terms. */
  plain: z.string(),
  refs: z.array(z.string()),
  confidence: z.enum(["confident", "uncertain", "untested"]),
  /** True when the sentence reports what the agent itself said (voiced by its persona). */
  attributedToAgent: z.boolean(),
  scene: SceneType,
});
export type Sentence = z.infer<typeof Sentence>;

export const Chapter = z.object({
  id: z.string(),
  kind: ChapterKind,
  title: z.string(),
  sentences: z.array(Sentence),
});
export type Chapter = z.infer<typeof Chapter>;

export const TaskScript = z.object({
  headline: z.string(),
  summary: z.object({ technical: z.string(), plain: z.string() }),
  businessImpact: z.string(),
  chapters: z.array(Chapter),
  decision: z.object({
    question: z.string(),
    recommendation: z.enum(["approve", "request_changes", "reject", "needs_discussion"]),
    reason: z.string(),
  }),
});
export type TaskScript = z.infer<typeof TaskScript>;

export interface ValidationIssue {
  path: string;
  message: string;
}

export interface ValidationContext {
  evidence: Evidence[];
  /** An uncertainty chapter is mandatory (missing tests, triage findings, agent unsure). */
  requireUncertainty: boolean;
  /** A context chapter is mandatory (anything beyond a trivial change). */
  requireContext?: boolean;
  /**
   * The video opens with a verdict chapter. For a problem PR (a medium or high finding, or a
   * blocking rule), `problemRefs` are what the findings cite and the verdict must show one of
   * them; for a clean PR it is null and the verdict is one short "No problems found" line.
   */
  verdict?: { problemRefs: string[] | null };
  /** Target spoken length. */
  minWords: number;
  maxWords: number;
}

function citesScreenshot(script: TaskScript): boolean {
  return script.chapters.some((c) =>
    c.sentences.some((s) => s.refs.some((r) => r.startsWith("shot:"))),
  );
}

/** ~150 spoken words per minute: 1 to 3 minute task videos. */
export const TASK_VIDEO_WORDS = { min: 140, max: 480 };
export const MAX_SENTENCE_WORDS = 42;

/** Ref syntax or line anchors leaking into narration ("[diff:src/a.ts#L4]", "#L41"). */
const REF_IN_TEXT =
  /\[?\b(?:diff|file|test|ci|shot|log|artifact|claim|task|code|doc|map|decision):[^\s\]]+|#L\d+/;

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Resolves a ref against the evidence set. Diff sub-ranges resolve to the hunk that contains them. */
export function resolveRef(ref: string, evidence: Evidence[]): Evidence | null {
  const exact = evidence.find((e) => e.ref === ref);
  if (exact) return exact;
  const parsed = parseRef(ref);
  if (!parsed) return null;
  if (parsed.type === "diff") {
    return (
      evidence.find((e) => {
        if (e.payload.kind !== "diff_hunk" || e.payload.hunk.file !== parsed.path) return false;
        const { start, end } = hunkRange(e.payload.hunk);
        return parsed.start >= start && parsed.end <= end;
      }) ?? null
    );
  }
  if (parsed.type === "code") {
    return (
      evidence.find((e) => {
        if (e.payload.kind !== "code" || e.payload.path !== parsed.path) return false;
        const end = e.payload.startLine + e.payload.lines.length - 1;
        return parsed.start >= e.payload.startLine && parsed.end <= end;
      }) ?? null
    );
  }
  if (parsed.type === "test") {
    // Allow citing a test by name without its suite prefix, and vice versa.
    return (
      evidence.find(
        (e) =>
          e.kind === "test_case" &&
          (e.ref.endsWith(parsed.name) || parsed.name.endsWith(e.ref.slice(5))),
      ) ?? null
    );
  }
  return null;
}

/** Changed lines covered by the hunks a set of refs points at (each hunk counted once). */
export function linesCovered(refList: string[], evidence: Evidence[]): number {
  const hunks = new Set<DiffHunk>();
  for (const ref of refList) {
    const e = resolveRef(ref, evidence);
    if (e?.payload.kind === "diff_hunk") hunks.add(e.payload.hunk);
  }
  return [...hunks].reduce((n, h) => n + h.additions + h.deletions, 0);
}

const REQUIRED_ORDER: ChapterKind[] = [
  "verdict",
  "context",
  "what_changed",
  "why",
  "how_checked",
  "uncertain",
  "decision",
];

const VERDICT_MAX_WORDS = { what: 12, clean: 14 };

/** Two refs point at overlapping lines of the same file, or are the same ref. */
function refsOverlap(a: string, b: string): boolean {
  if (a === b) return true;
  const pa = parseRef(a);
  const pb = parseRef(b);
  if (pa?.type !== "diff" || pb?.type !== "diff" || pa.path !== pb.path) return false;
  return pa.start <= pb.end && pb.start <= pa.end;
}

/**
 * The opening verdict. A problem PR: what the PR does (one short line), the defect shown
 * on its code, then the recommendation, so a reviewer knows what's wrong by about 0:10.
 * A clean PR: one short line that starts "No problems found".
 */
function verdictIssues(script: TaskScript, problemRefs: string[] | null): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const verdicts = script.chapters.filter((c) => c.kind === "verdict");
  if (verdicts.length !== 1 || script.chapters[0]?.kind !== "verdict") {
    issues.push({
      path: "chapters",
      message: 'Open with exactly one "verdict" chapter, before everything else.',
    });
    return issues;
  }
  const v = verdicts[0]!.sentences;
  if (!problemRefs) {
    if (v.length !== 1)
      issues.push({
        path: "chapters[0]",
        message: "For a clean change the verdict is one sentence.",
      });
    const first = v[0];
    if (first && !/^no problems found/i.test(first.technical.trim()))
      issues.push({
        path: "chapters[0]",
        message: 'The verdict for a clean change starts "No problems found".',
      });
    if (first && words(first.technical) > VERDICT_MAX_WORDS.clean)
      issues.push({
        path: "chapters[0]",
        message: `The verdict line is too long; at most ${VERDICT_MAX_WORDS.clean} words, about 3 seconds.`,
      });
    return issues;
  }
  if (v.length !== 3) {
    issues.push({
      path: "chapters[0]",
      message:
        "For a change with a problem the verdict has exactly three sentences: what the PR does, the problem shown on its code, and your recommendation.",
    });
    return issues;
  }
  const [what, problem, recommend] = v as [Sentence, Sentence, Sentence];
  if (words(what.technical) > VERDICT_MAX_WORDS.what)
    issues.push({
      path: "chapters[0].sentences[0]",
      message: `The first verdict sentence says what the PR does in at most ${VERDICT_MAX_WORDS.what} words.`,
    });
  if (!["diff", "tests", "ci"].includes(problem.scene))
    issues.push({
      path: "chapters[0].sentences[1]",
      message:
        "The second verdict sentence shows the problem on screen: use the diff, tests or ci scene.",
    });
  if (!problem.refs.some((r) => problemRefs.some((p) => refsOverlap(r, p))))
    issues.push({
      path: "chapters[0].sentences[1]",
      message: `The second verdict sentence must cite the lines the finding is about (one of: ${problemRefs.slice(0, 6).join(", ")}).`,
    });
  if (recommend.scene !== "decision")
    issues.push({
      path: "chapters[0].sentences[2]",
      message: "The third verdict sentence gives your recommendation with the decision scene.",
    });
  return issues;
}

/**
 * Enforces Lumi's narration rules. Every issue is phrased so it can be fed back
 * to the model verbatim when asking for a corrected script.
 */
export function validateScript(script: TaskScript, ctx: ValidationContext): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const seenIds = new Set<string>();
  let total = 0;

  if (script.chapters.length === 0)
    issues.push({ path: "chapters", message: "The script has no chapters." });

  // Chapter order: kinds must appear in the canonical order (what_changed may repeat for large changes).
  let last = -1;
  script.chapters.forEach((c, i) => {
    const idx = REQUIRED_ORDER.indexOf(c.kind);
    if (idx < last) {
      issues.push({
        path: `chapters[${i}]`,
        message: `Chapter "${c.title}" (${c.kind}) is out of order; use: ${REQUIRED_ORDER.join(" → ")}.`,
      });
    }
    last = Math.max(last, idx);
  });
  for (const kind of ["what_changed", "how_checked", "decision"] as const) {
    if (!script.chapters.some((c) => c.kind === kind))
      issues.push({ path: "chapters", message: `Missing a "${kind}" chapter.` });
  }
  const context = script.chapters.filter((c) => c.kind === "context");
  if (ctx.requireContext && context.length === 0) {
    issues.push({
      path: "chapters",
      message:
        'Missing a "context" chapter. After the verdict, orient the viewer in 2–5 sentences: the problem the task addressed, where the change sits in the codebase, and the key decisions.',
    });
  }
  if (context.length > 1)
    issues.push({ path: "chapters", message: "Use a single context chapter." });
  for (const c of context) {
    if (c.sentences.length > 5) {
      issues.push({
        path: "chapters",
        message: `The context chapter has ${c.sentences.length} sentences; keep it to at most 5.`,
      });
    }
  }
  if (ctx.verdict) issues.push(...verdictIssues(script, ctx.verdict.problemRefs));
  if (ctx.requireUncertainty && !script.chapters.some((c) => c.kind === "uncertain")) {
    issues.push({
      path: "chapters",
      message:
        'Missing an "uncertain" chapter. There are open risks (missing or skipped tests, triage findings, or the agent said it was unsure); say plainly what is uncertain.',
    });
  }

  script.chapters.forEach((chapter, ci) => {
    if (chapter.sentences.length === 0)
      issues.push({
        path: `chapters[${ci}]`,
        message: `Chapter "${chapter.title}" has no sentences.`,
      });

    if (chapter.kind === "what_changed") {
      const covered = linesCovered(
        chapter.sentences.flatMap((s) => s.refs),
        ctx.evidence,
      );
      if (covered > REVIEW_LINE_BUDGET) {
        issues.push({
          path: `chapters[${ci}]`,
          message: `Chapter "${chapter.title}" walks through ${covered} changed lines; split it into chapters of at most ${REVIEW_LINE_BUDGET} changed lines each.`,
        });
      }
    }

    chapter.sentences.forEach((s, si) => {
      const path = `chapters[${ci}].sentences[${si}]`;
      if (seenIds.has(s.id)) issues.push({ path, message: `Duplicate sentence id "${s.id}".` });
      seenIds.add(s.id);
      total += words(s.technical);

      if (!s.technical.trim() || !s.plain.trim()) {
        issues.push({
          path,
          message: `Sentence "${s.id}" needs both a technical and a plain version.`,
        });
      }
      if (REF_IN_TEXT.test(s.technical) || REF_IN_TEXT.test(s.plain)) {
        issues.push({
          path,
          message: `Sentence "${s.id}" puts an evidence ref or line number in the spoken text. Refs belong only in the refs field; the text is read aloud.`,
        });
      }
      if (words(s.technical) > MAX_SENTENCE_WORDS || words(s.plain) > MAX_SENTENCE_WORDS) {
        issues.push({
          path,
          message: `Sentence "${s.id}" is too long to narrate (max ${MAX_SENTENCE_WORDS} words); split it.`,
        });
      }
      if (s.refs.length === 0) {
        issues.push({
          path,
          message: `Sentence "${s.id}" ("${s.technical.slice(0, 60)}…") has no evidence ref. Every claim must cite evidence.`,
        });
        return;
      }
      const resolved = s.refs.map((r) => ({ ref: r, e: resolveRef(r, ctx.evidence) }));
      for (const { ref, e } of resolved) {
        if (!e)
          issues.push({
            path,
            message: `Sentence "${s.id}" cites "${ref}", which is not in the evidence list. Use only listed refs.`,
          });
        else if (e.payload.kind === "file" && isGeneratedFile(e.payload.file.path)) {
          issues.push({
            path,
            message: `Sentence "${s.id}" cites generated file ${e.payload.file.path}; cite source changes instead.`,
          });
        }
      }
      const onlyClaims = resolved.every(({ e }) => e?.kind === "agent_claim");
      if (onlyClaims && !s.attributedToAgent) {
        issues.push({
          path,
          message: `Sentence "${s.id}" is supported only by the agent's own description. Either cite independent evidence or set attributedToAgent and phrase it as what the agent said.`,
        });
      }
      if (onlyClaims && s.confidence === "confident") {
        issues.push({
          path,
          message: `Sentence "${s.id}" relies only on the agent's claim, so its confidence cannot be "confident".`,
        });
      }
      if (chapter.kind === "decision" && s.attributedToAgent) {
        issues.push({
          path,
          message: `Sentence "${s.id}" is in the agent's voice, but the decision chapter is Lumi's own recommendation; narrate it independently.`,
        });
      }
      if (s.scene === "claim" && !s.attributedToAgent) {
        issues.push({
          path,
          message: `Sentence "${s.id}" uses the claim scene but isn't the agent's own words. Use the claim scene only for attributedToAgent sentences; comment on the claim with the uncertain scene.`,
        });
      }
      if (s.scene === "decision" && chapter.kind !== "decision" && chapter.kind !== "verdict") {
        issues.push({
          path,
          message: `Sentence "${s.id}" uses the decision scene outside the decision chapter.`,
        });
      }
    });
  });

  if (ctx.evidence.some((e) => e.kind === "screenshot") && !citesScreenshot(script)) {
    issues.push({
      path: "chapters",
      message:
        "Before and after screenshots exist for this change but no sentence shows them. Add a sentence with the before_after scene citing both shot: refs.",
    });
  }
  if (total < ctx.minWords) {
    issues.push({
      path: "chapters",
      message: `The narration is ${total} words; it needs at least ${ctx.minWords} (about one minute).`,
    });
  }
  if (total > ctx.maxWords) {
    issues.push({
      path: "chapters",
      message: `The narration is ${total} words; keep it under ${ctx.maxWords} (about three minutes). Cut routine detail, keep risks.`,
    });
  }
  return issues;
}

export function scriptWordCount(script: TaskScript): number {
  return script.chapters.reduce(
    (n, c) => n + c.sentences.reduce((m, s) => m + words(s.technical), 0),
    0,
  );
}

/**
 * Groups changed files into review chapters of at most `budget` changed lines,
 * keeping files from the same directory together. Guides the story builder on
 * large changes.
 */
export function planChapters(
  files: { path: string; additions: number; deletions: number }[],
  budget = REVIEW_LINE_BUDGET,
): { files: string[]; lines: number }[] {
  const reviewable = files.filter((f) => !isGeneratedFile(f.path) && f.additions + f.deletions > 0);
  const byDir = new Map<string, typeof reviewable>();
  for (const f of reviewable) {
    const dir = f.path.includes("/") ? f.path.slice(0, f.path.lastIndexOf("/")) : ".";
    byDir.set(dir, [...(byDir.get(dir) ?? []), f]);
  }
  const chapters: { files: string[]; lines: number }[] = [];
  let current = { files: [] as string[], lines: 0 };
  const flush = () => {
    if (current.files.length) chapters.push(current);
    current = { files: [], lines: 0 };
  };
  for (const group of byDir.values()) {
    // Source before tests so each chapter reads "code, then its tests".
    group.sort(
      (a, b) =>
        Number(/\.test\./.test(a.path)) - Number(/\.test\./.test(b.path)) ||
        a.path.localeCompare(b.path),
    );
    for (const f of group) {
      const lines = f.additions + f.deletions;
      if (current.lines + lines > budget && current.files.length) flush();
      current.files.push(f.path);
      current.lines += lines;
    }
  }
  flush();
  return chapters;
}
