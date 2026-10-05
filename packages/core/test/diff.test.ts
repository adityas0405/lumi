import { describe, expect, it } from "vitest";
import { changedLineCount, hunkRange, parsePatch } from "../src/diff";

const PATCH = [
  "@@ -10,6 +10,7 @@ export function tax(cents: number) {",
  "   const rate = 0.0825;",
  "-  return Math.round(cents * rate);",
  "+  const raw = cents * rate;",
  "+  return roundHalfEven(raw);",
  "   // end",
  "@@ -40 +41,2 @@",
  "-old",
  "+new",
  "+newer",
  "\\ No newline at end of file",
].join("\n");

describe("parsePatch", () => {
  const hunks = parsePatch("src/tax.ts", PATCH);

  it("splits hunks and counts changes", () => {
    expect(hunks).toHaveLength(2);
    expect(hunks[0]).toMatchObject({ oldStart: 10, newStart: 10, additions: 2, deletions: 1 });
    expect(hunks[1]).toMatchObject({ oldStart: 40, oldLines: 1, newStart: 41, newLines: 2 });
    expect(changedLineCount(hunks)).toBe(6);
  });

  it("numbers old and new lines", () => {
    const lines = hunks[0]!.lines;
    expect(lines[0]).toEqual({
      type: "ctx",
      text: "  const rate = 0.0825;",
      oldLine: 10,
      newLine: 10,
    });
    expect(lines[1]).toMatchObject({ type: "del", oldLine: 11, newLine: null });
    expect(lines[2]).toMatchObject({ type: "add", oldLine: null, newLine: 11 });
    expect(lines[3]).toMatchObject({ type: "add", newLine: 12 });
    expect(lines[4]).toMatchObject({ type: "ctx", oldLine: 12, newLine: 13 });
  });

  it("ignores the no-newline marker and a trailing newline", () => {
    expect(hunks[1]!.lines).toHaveLength(3);
    expect(parsePatch("a", `${PATCH}\n`)[1]!.lines).toHaveLength(3);
  });

  it("computes new-file ranges, including deletion-only hunks", () => {
    expect(hunkRange(hunks[0]!)).toEqual({ start: 10, end: 16 });
    const [del] = parsePatch("a", "@@ -5,2 +4,0 @@\n-x\n-y");
    expect(hunkRange(del!)).toEqual({ start: 4, end: 4 });
  });
});
