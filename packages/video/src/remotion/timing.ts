import type { SceneType, Timeline, TimelineSentence } from "@lumi/core";

export const msToFrame = (ms: number, fps: number) => Math.round((ms / 1000) * fps);

export interface Segment {
  scene: SceneType;
  /** First cited ref; consecutive sentences on the same evidence share a segment. */
  key: string;
  sentences: TimelineSentence[];
  startMs: number;
  endMs: number;
}

/** Scenes that show the sentence itself on stage, so the caption is hidden. */
export const TEXT_SCENES = new Set<SceneType>(["claim", "uncertain"]);

/**
 * Groups consecutive sentences that show the same thing, so the picture only
 * cuts when the evidence changes. Each segment runs until the next one starts.
 */
export function segmentsOf(timeline: Timeline): Segment[] {
  const segments: Segment[] = [];
  for (const s of timeline.sentences) {
    const primary = s.refs.find((r) => r.startsWith("diff:"))?.split("#")[0] ?? s.refs[0] ?? "";
    // The diff and the map stay on screen across sentences; only the focus moves.
    const key = `${s.scene}|${s.scene === "diff" ? primary : s.scene === "map" ? "" : s.scene === "task" ? (s.refs[0] ?? "") : s.id}`;
    const last = segments.at(-1);
    const continuous = last && last.key === key && !TEXT_SCENES.has(s.scene);
    if (continuous) {
      last.sentences.push(s);
    } else {
      // Cut slightly before the words start so the picture leads the voice.
      segments.push({
        scene: s.scene,
        key,
        sentences: [s],
        startMs: Math.max(timeline.leadInMs - 400, s.startMs - 250),
        endMs: 0,
      });
    }
  }
  segments.forEach((seg, i) => {
    seg.endMs = segments[i + 1]?.startMs ?? timeline.durationMs;
  });
  return segments;
}

/** How much of a sentence has been spoken at `ms`, 0–1, by spoken word count. */
export function spokenFraction(s: TimelineSentence, ms: number): number {
  if (ms < s.startMs) return 0;
  if (ms >= s.endMs || s.words.length === 0) return ms >= s.startMs ? 1 : 0;
  const spoken = s.words.filter((w) => w.startMs <= ms).length;
  return spoken / s.words.length;
}

export function formatClock(ms: number): string {
  const total = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(total / 60)}:${String(total % 60).padStart(2, "0")}`;
}
