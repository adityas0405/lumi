import { describe, expect, it } from "vitest";
import type { TaskScript } from "../src/script";
import { layoutTimeline, sentenceAt, TIMING, toWebVtt } from "../src/timeline";

const sent = (id: string, over = {}) => ({
  id,
  technical: `Sentence ${id}.`,
  plain: `Plain ${id}.`,
  refs: ["diff:a.ts#L1-L1"],
  confidence: "confident" as const,
  attributedToAgent: false,
  scene: "diff" as const,
  ...over,
});
const script: TaskScript = {
  headline: "h",
  summary: { technical: "t", plain: "p" },
  businessImpact: "b",
  chapters: [
    {
      id: "c1",
      kind: "what_changed",
      title: "What changed",
      sentences: [sent("c1.s1"), sent("c1.s2")],
    },
    {
      id: "c2",
      kind: "uncertain",
      title: "Risks",
      sentences: [sent("c2.s1", { attributedToAgent: true, scene: "claim" })],
    },
  ],
  decision: { question: "q", recommendation: "approve", reason: "r" },
};
const clip = (ms: number) => ({
  durationMs: ms,
  words: [{ word: "Sentence", startMs: 0, endMs: ms / 2 }],
});
const clips = new Map([
  ["c1.s1", clip(2000)],
  ["c1.s2", clip(1000)],
  ["c2.s1", clip(1500)],
]);

describe("layoutTimeline", () => {
  const { timeline, gapsBeforeMs } = layoutTimeline(script, "devin", clips);
  const [a, b, c] = timeline.sentences;

  it("places sentences after the lead-in with sentence and chapter gaps", () => {
    expect(a!.startMs).toBe(TIMING.leadInMs);
    expect(a!.endMs).toBe(TIMING.leadInMs + 2000);
    expect(b!.startMs).toBe(a!.endMs + TIMING.sentenceGapMs);
    expect(c!.startMs).toBe(b!.endMs + TIMING.chapterGapMs);
    expect(timeline.durationMs).toBe(c!.endMs + TIMING.tailMs);
  });

  it("records the gaps used to assemble the audio", () => {
    expect([...gapsBeforeMs.values()]).toEqual([
      TIMING.leadInMs,
      TIMING.sentenceGapMs,
      TIMING.chapterGapMs,
    ]);
  });

  it("makes word timings absolute and voices agent quotes with the agent", () => {
    expect(b!.words[0]).toEqual({ word: "Sentence", startMs: b!.startMs, endMs: b!.startMs + 500 });
    expect(c!.voice).toBe("devin");
    expect(a!.voice).toBe("narrator");
  });

  it("spans chapters over their sentences", () => {
    expect(timeline.chapters.map((ch) => [ch.startMs, ch.endMs])).toEqual([
      [TIMING.leadInMs, b!.endMs],
      [c!.startMs, c!.endMs],
    ]);
  });

  it("finds the sentence at a time, holding through pauses", () => {
    expect(sentenceAt(timeline, 0)).toBeNull();
    expect(sentenceAt(timeline, a!.endMs + 10)?.id).toBe("c1.s1");
    expect(sentenceAt(timeline, c!.startMs)?.id).toBe("c2.s1");
  });

  it("writes WebVTT with voice tags for agent quotes", () => {
    const vtt = toWebVtt(timeline, () => "Devin");
    expect(vtt.startsWith("WEBVTT")).toBe(true);
    expect(vtt).toContain("00:00:02.600 --> 00:00:04.600");
    expect(vtt).toContain("<v Devin>Sentence c2.s1.");
  });

  it("fails loudly when a sentence has no audio", () => {
    expect(() => layoutTimeline(script, "devin", new Map())).toThrow(/No audio/);
  });
});
