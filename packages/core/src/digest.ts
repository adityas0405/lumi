import { z } from "zod";
import type { ValidationIssue } from "./script";
import { MAX_SENTENCE_WORDS, type Sentence } from "./script";

const ORDER: DigestSection[] = ["decisions", "problems", "highlights", "routine"];

export const DigestSection = z.enum(["decisions", "problems", "highlights", "routine"]);
export type DigestSection = z.infer<typeof DigestSection>;

/** One task's slot in the digest: why it was asked, then 1–2 spoken sentences, 10–20 seconds. */
export const DigestItem = z.object({
  taskId: z.string(),
  why: z
    .object({ technical: z.string(), plain: z.string() })
    .describe(
      "One short sentence (at most 14 words) on why the work was asked for and who asked, from the linked request. Empty only for a task that shares the previous item's request.",
    ),
  technical: z.array(z.string()).describe("1 or 2 spoken sentences for engineers."),
  plain: z
    .array(z.string())
    .describe("The same sentences for a non-technical owner, in the same order."),
});
export type DigestItem = z.infer<typeof DigestItem>;

export const DigestScript = z.object({
  sections: z.array(
    z.object({
      kind: DigestSection,
      items: z.array(DigestItem),
    }),
  ),
  /** One spoken line summarising routine work, or empty. */
  routineLine: z.object({ technical: z.string(), plain: z.string() }),
  /** Closing line: what the reviewer should do first. */
  closing: z.object({ technical: z.string(), plain: z.string() }),
});
export type DigestScript = z.infer<typeof DigestScript>;

export interface DigestCandidate {
  taskId: string;
  section: DigestSection;
  /** The agent's display name, which a why-line must use when no request is linked. */
  agent?: string;
  /** The linked request's number, or null when the agent's work has no linked request. */
  request?: number | null;
  /** Set when this task closes the same request as the item just before it. */
  sameRequestAs?: string | null;
}

export const MAX_WHY_WORDS = 14;
const MIN_ITEM_WORDS = 18;
const MAX_ITEM_WORDS = 36;

/**
 * Orders candidates so tasks closing the same request sit next to each other within
 * their section, keeping first-appearance order, and marks each follower with the task
 * it follows. A briefing about requests, the way an owner thinks.
 */
export function groupByRequest(candidates: DigestCandidate[]): DigestCandidate[] {
  const out: DigestCandidate[] = [];
  for (const section of ORDER) {
    const inSection = candidates.filter((c) => c.section === section);
    const placed = new Set<string>();
    for (const c of inSection) {
      if (placed.has(c.taskId)) continue;
      placed.add(c.taskId);
      out.push({ ...c, sameRequestAs: null });
      if (c.request == null) continue;
      let prev = c.taskId;
      for (const other of inSection) {
        if (placed.has(other.taskId) || other.request !== c.request) continue;
        placed.add(other.taskId);
        out.push({ ...other, sameRequestAs: prev });
        prev = other.taskId;
      }
    }
  }
  return out;
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/**
 * The digest must cover exactly the tasks Lumi chose for each section (counts come
 * from code, not the model), keep problems first and items short.
 */
export function validateDigest(
  script: DigestScript,
  candidates: DigestCandidate[],
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const byTask = new Map(
    candidates.filter((c) => c.section !== "routine").map((c) => [c.taskId, c]),
  );
  const expected = new Map([...byTask].map(([id, c]) => [id, c.section]));
  const seen = new Set<string>();
  let last = -1;
  script.sections.forEach((section, si) => {
    const idx = ORDER.indexOf(section.kind);
    if (idx < last)
      issues.push({
        path: `sections[${si}]`,
        message: `Section "${section.kind}" is out of order; use decisions, problems, highlights.`,
      });
    last = Math.max(last, idx);
    if (section.kind === "routine" && section.items.length) {
      issues.push({
        path: `sections[${si}]`,
        message: "Routine work goes in routineLine, not as items.",
      });
    }
    section.items.forEach((item, ii) => {
      const path = `sections[${si}].items[${ii}]`;
      const want = expected.get(item.taskId);
      if (!want)
        issues.push({
          path,
          message: `Item ${item.taskId} isn't one of the tasks listed for this digest.`,
        });
      else if (want !== section.kind)
        issues.push({
          path,
          message: `Task ${item.taskId} belongs in "${want}", not "${section.kind}".`,
        });
      if (seen.has(item.taskId))
        issues.push({ path, message: `Task ${item.taskId} appears twice.` });
      seen.add(item.taskId);
      if (item.technical.length < 1 || item.technical.length > 2)
        issues.push({ path, message: "Each item needs 1 or 2 technical sentences." });
      if (item.plain.length !== item.technical.length)
        issues.push({ path, message: "Give one plain sentence for each technical sentence." });
      const cand = byTask.get(item.taskId);
      const why = item.why.technical.trim();
      if (!why && !cand?.sameRequestAs)
        issues.push({
          path,
          message: `Item ${item.taskId} needs a why line: why it was asked for and who asked.`,
        });
      if (why && !item.why.plain.trim())
        issues.push({ path, message: `Give a plain why line for item ${item.taskId}.` });
      if (words(why) > MAX_WHY_WORDS)
        issues.push({
          path,
          message: `The why line for item ${item.taskId} is too long; at most ${MAX_WHY_WORDS} words.`,
        });
      if (why && cand && cand.request === null && cand.agent) {
        const agent = cand.agent.toLowerCase();
        if (![item.why.technical, item.why.plain].every((s) => s.toLowerCase().includes(agent)))
          issues.push({
            path,
            message: `Task ${item.taskId} has no linked request: say so and attribute the description to ${cand.agent} in both why lines.`,
          });
      }
      if (cand?.sameRequestAs) {
        const prev = section.items[ii - 1]?.taskId;
        if (prev !== cand.sameRequestAs)
          issues.push({
            path,
            message: `Task ${item.taskId} closes the same request as ${cand.sameRequestAs}; put it right after that item.`,
          });
      }
      const n = words(why) + item.technical.reduce((a, s) => a + words(s), 0);
      if (n < MIN_ITEM_WORDS || n > MAX_ITEM_WORDS)
        issues.push({
          path,
          message: `Item ${item.taskId} is ${n} words with its why line; keep each item to 10–15 seconds (about 20–${MAX_ITEM_WORDS} words).`,
        });
      for (const s of [...item.technical, ...item.plain]) {
        if (words(s) > MAX_SENTENCE_WORDS)
          issues.push({
            path,
            message: `A sentence in item ${item.taskId} is too long to narrate; split it.`,
          });
      }
    });
  });
  if (words(script.routineLine.technical) > 18) {
    issues.push({
      path: "routineLine",
      message:
        "The routine line is too long; one short sentence that counts the routine work (at most 18 words).",
    });
  }
  if (words(script.closing.technical) > 20)
    issues.push({ path: "closing", message: "The closing is too long; at most 20 words." });
  for (const [taskId, section] of expected) {
    if (!seen.has(taskId))
      issues.push({
        path: "sections",
        message: `Task ${taskId} (${section}) is missing from the digest.`,
      });
  }
  return issues;
}

/**
 * Turns a digest into chapters of spoken sentences for the shared timeline. Each
 * sentence cites the task review it summarises (`review:<taskId>`); a why line also
 * cites the request it comes from (`task:<n>`), passed in `requestRefs` by task.
 */
export function digestNarration(
  script: DigestScript,
  intro: { technical: string; plain: string },
  requestRefs: Map<string, string> = new Map(),
) {
  const chapters: { id: string; kind: DigestSection; title: string; sentences: Sentence[] }[] = [];
  const mk = (id: string, technical: string, plain: string, refs: string[]): Sentence => ({
    id,
    technical,
    plain,
    refs,
    confidence: "confident",
    attributedToAgent: false,
    scene: "title",
  });
  const titles: Record<DigestSection, string> = {
    decisions: "Decisions",
    problems: "Problems",
    highlights: "Highlights",
    routine: "Routine",
  };
  let first = true;
  for (const section of script.sections) {
    if (section.kind === "routine" || section.items.length === 0) continue;
    const sentences: Sentence[] = [];
    if (first)
      sentences.push(mk(`${section.kind}.intro`, intro.technical, intro.plain, ["digest:counts"]));
    first = false;
    for (const item of section.items) {
      const request = requestRefs.get(item.taskId);
      if (item.why?.technical.trim())
        sentences.push(
          mk(
            `${section.kind}.${item.taskId}.why`,
            item.why.technical,
            item.why.plain || item.why.technical,
            [`review:${item.taskId}`, ...(request ? [request] : [])],
          ),
        );
      item.technical.forEach((t, i) => {
        sentences.push(
          mk(`${section.kind}.${item.taskId}.${i}`, t, item.plain[i] ?? t, [
            `review:${item.taskId}`,
          ]),
        );
      });
    }
    chapters.push({ id: section.kind, kind: section.kind, title: titles[section.kind], sentences });
  }
  const tail: Sentence[] = [];
  if (first) tail.push(mk("routine.intro", intro.technical, intro.plain, ["digest:counts"]));
  if (script.routineLine.technical.trim())
    tail.push(
      mk("routine.line", script.routineLine.technical, script.routineLine.plain, [
        "digest:routine",
      ]),
    );
  if (script.closing.technical.trim())
    tail.push(
      mk("routine.closing", script.closing.technical, script.closing.plain, ["digest:counts"]),
    );
  const hasRoutine = tail.some((t) => t.id === "routine.line");
  if (tail.length)
    chapters.push({
      id: "routine",
      kind: "routine",
      title: hasRoutine ? "Routine" : "Next step",
      sentences: tail,
    });
  return { chapters };
}

/** Headline counts, computed from data rather than written by a model. */
export function digestHeadline(counts: {
  decisions: number;
  problems: number;
  done: number;
}): string {
  const parts: string[] = [];
  if (counts.decisions)
    parts.push(`${counts.decisions} decision${counts.decisions === 1 ? "" : "s"}`);
  if (counts.problems) parts.push(`${counts.problems} problem${counts.problems === 1 ? "" : "s"}`);
  if (counts.done) parts.push(`${counts.done} task${counts.done === 1 ? "" : "s"} done`);
  return parts.length ? parts.join(", ") : "nothing new";
}
