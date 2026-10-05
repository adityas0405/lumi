import type { DiffHunk, DiffLine } from "./schemas";

const HUNK_HEADER = /^@@ -(\d+)(?:,(\d+))? \+(\d+)(?:,(\d+))? @@(.*)$/;

/**
 * Parses the `patch` field GitHub returns per file (unified diff hunks, no file
 * headers) into hunks with old/new line numbers on every line.
 */
export function parsePatch(file: string, patch: string): DiffHunk[] {
  const hunks: DiffHunk[] = [];
  let current: DiffHunk | null = null;
  let oldLine = 0;
  let newLine = 0;

  for (const raw of patch.replace(/\n$/, "").split("\n")) {
    const header = HUNK_HEADER.exec(raw);
    if (header) {
      const oldStart = Number(header[1]);
      const newStart = Number(header[3]);
      current = {
        file,
        header: raw,
        oldStart,
        oldLines: header[2] === undefined ? 1 : Number(header[2]),
        newStart,
        newLines: header[4] === undefined ? 1 : Number(header[4]),
        additions: 0,
        deletions: 0,
        lines: [],
      };
      hunks.push(current);
      oldLine = oldStart;
      newLine = newStart;
      continue;
    }
    if (!current) continue;
    if (raw.startsWith("\\")) continue; // "\ No newline at end of file"

    let line: DiffLine;
    if (raw.startsWith("+")) {
      line = { type: "add", text: raw.slice(1), oldLine: null, newLine: newLine++ };
      current.additions++;
    } else if (raw.startsWith("-")) {
      line = { type: "del", text: raw.slice(1), oldLine: oldLine++, newLine: null };
      current.deletions++;
    } else {
      // Context lines start with a space; an empty string is a context line whose
      // leading space was trimmed by the source.
      line = { type: "ctx", text: raw.slice(1), oldLine: oldLine++, newLine: newLine++ };
    }
    current.lines.push(line);
  }

  return hunks;
}

/** New-file line range a hunk covers; deletion-only hunks anchor at newStart. */
export function hunkRange(hunk: DiffHunk): { start: number; end: number } {
  const start = Math.max(1, hunk.newStart);
  const end = hunk.newLines > 0 ? hunk.newStart + hunk.newLines - 1 : start;
  return { start, end: Math.max(start, end) };
}

export function changedLineCount(hunks: DiffHunk[]): number {
  return hunks.reduce((n, h) => n + h.additions + h.deletions, 0);
}
