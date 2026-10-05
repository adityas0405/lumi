import { parseRef } from "@lumi/core";
import type { CodeLine, HunkView } from "../props";

export interface LineRange {
  path: string;
  start: number;
  end: number;
}

export function diffRanges(refs: string[]): LineRange[] {
  return refs.flatMap((r) => {
    const p = parseRef(r);
    return p?.type === "diff" ? [{ path: p.path, start: p.start, end: p.end }] : [];
  });
}

/** The hunk a diff ref points into (exact hunk or a sub-range of it). */
export function hunkFor(hunks: HunkView[], ref: string): HunkView | null {
  const exact = hunks.find((h) => h.ref === ref);
  if (exact) return exact;
  const [range] = diffRanges([ref]);
  if (!range) return null;
  return (
    hunks.find((h) => {
      if (h.file !== range.path) return false;
      const nums = h.lines.map((l) => l.newLine).filter((n): n is number => n !== null);
      return (
        nums.length > 0 && range.start >= Math.min(...nums) && range.end <= Math.max(...nums) + 1
      );
    }) ?? null
  );
}

/**
 * Indices of the lines a sentence is about. A ref covering the whole hunk means
 * "the change": the added and removed lines. A narrower ref means those lines,
 * plus removed lines directly above them (what they replaced).
 */
export function focusLines(hunk: HunkView, refs: string[]): Set<number> {
  const ranges = diffRanges(refs).filter((r) => r.path === hunk.file);
  const focus = new Set<number>();
  const wholeHunk = refs.includes(hunk.ref) || ranges.length === 0;
  if (wholeHunk) {
    hunk.lines.forEach((l, i) => {
      if (l.kind !== "ctx") focus.add(i);
    });
    return focus;
  }
  hunk.lines.forEach((l, i) => {
    if (l.newLine !== null && ranges.some((r) => l.newLine! >= r.start && l.newLine! <= r.end))
      focus.add(i);
  });
  // Pull in the removed lines the focused lines replaced: within the same block of
  // changes, removed lines that share identifiers with a focused added line.
  const ids = (t: string) => new Set(t.match(/[A-Za-z_]\w{2,}/g) ?? []);
  for (const i of [...focus]) {
    const line = hunk.lines[i]!;
    if (line.kind !== "add") continue;
    let a = i;
    let b = i;
    while (a > 0 && hunk.lines[a - 1]!.kind !== "ctx") a--;
    while (b < hunk.lines.length - 1 && hunk.lines[b + 1]!.kind !== "ctx") b++;
    const mine = ids(textOf(line));
    for (let j = a; j <= b; j++) {
      const other = hunk.lines[j]!;
      if (other.kind !== "del") continue;
      const shared = [...ids(textOf(other))].filter((x) => mine.has(x)).length;
      if (shared >= 2) focus.add(j);
    }
  }
  return focus;
}

function textOf(l: CodeLine): string {
  return l.tokens.map((t) => t.text).join("");
}

export function lineIsDefect(line: CodeLine, file: string, defectRanges: LineRange[]): boolean {
  return (
    line.newLine !== null &&
    defectRanges.some((r) => r.path === file && line.newLine! >= r.start && line.newLine! <= r.end)
  );
}
