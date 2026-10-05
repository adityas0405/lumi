import { describe, expect, it } from "vitest";
import { wordsFromAlignment } from "../src/elevenlabs";

describe("wordsFromAlignment", () => {
  it("groups characters into words and drops punctuation-only tokens", () => {
    const text = "Full refunds fail .";
    const chars = [...text];
    const starts = chars.map((_, i) => i * 0.1);
    const ends = chars.map((_, i) => i * 0.1 + 0.1);
    const words = wordsFromAlignment({
      characters: chars,
      character_start_times_seconds: starts,
      character_end_times_seconds: ends,
    });
    expect(words).toEqual([
      { word: "Full", startMs: 0, endMs: 400 },
      { word: "refunds", startMs: 500, endMs: 1200 },
      { word: "fail", startMs: 1300, endMs: 1700 },
    ]);
  });
});
