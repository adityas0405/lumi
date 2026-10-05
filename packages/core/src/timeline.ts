import type { AgentKey } from "./schemas";
import type { ChapterKind, SceneType, Sentence } from "./script";

export interface TimedWord {
  word: string;
  startMs: number;
  endMs: number;
}

export interface TimelineSentence {
  id: string;
  chapterId: string;
  chapterIndex: number;
  startMs: number;
  endMs: number;
  technical: string;
  plain: string;
  refs: string[];
  scene: SceneType;
  confidence: "confident" | "uncertain" | "untested";
  attributedToAgent: boolean;
  voice: "narrator" | AgentKey;
  /** Absolute word timings, for captions and scene cuts. */
  words: TimedWord[];
}

export type DigestChapterKind = "decisions" | "problems" | "highlights" | "routine";

export interface TimelineChapter {
  id: string;
  kind: ChapterKind | DigestChapterKind;
  title: string;
  startMs: number;
  endMs: number;
}

/**
 * Everything the renderer and the player need to put words and evidence on
 * screen in sync: when each sentence plays, which evidence it cites, and where
 * each chapter starts.
 */
export interface Timeline {
  version: 1;
  durationMs: number;
  /** Silent title card before the narration starts. */
  leadInMs: number;
  chapters: TimelineChapter[];
  sentences: TimelineSentence[];
}

export const TIMING = {
  leadInMs: 2600,
  sentenceGapMs: 320,
  chapterGapMs: 800,
  tailMs: 1600,
};

export interface ClipTiming {
  durationMs: number;
  words: TimedWord[];
}

/**
 * Lays sentences end to end with fixed pauses. `clips` is keyed by sentence id.
 * The same gaps are used to assemble the audio, so text and sound stay in sync.
 */
/** Anything laid out as chapters of spoken sentences: a task script or a digest script. */
export interface Narration {
  chapters: {
    id: string;
    kind: ChapterKind | DigestChapterKind;
    title: string;
    sentences: Sentence[];
  }[];
}

export function layoutTimeline(
  script: Narration,
  agent: AgentKey,
  clips: Map<string, ClipTiming>,
  timing = TIMING,
): { timeline: Timeline; gapsBeforeMs: Map<string, number> } {
  const sentences: TimelineSentence[] = [];
  const chapters: TimelineChapter[] = [];
  const gapsBeforeMs = new Map<string, number>();
  let cursor = timing.leadInMs;

  script.chapters.forEach((chapter, ci) => {
    const chapterStart = cursor + (ci === 0 ? 0 : timing.chapterGapMs);
    chapter.sentences.forEach((s, si) => {
      const clip = clips.get(s.id);
      if (!clip) throw new Error(`No audio for sentence ${s.id}`);
      const gap =
        si === 0 ? (ci === 0 ? timing.leadInMs : timing.chapterGapMs) : timing.sentenceGapMs;
      gapsBeforeMs.set(s.id, gap);
      const start = (si === 0 && ci === 0 ? 0 : cursor) + gap;
      sentences.push({
        id: s.id,
        chapterId: chapter.id,
        chapterIndex: ci,
        startMs: start,
        endMs: start + clip.durationMs,
        technical: s.technical,
        plain: s.plain,
        refs: s.refs,
        scene: s.scene,
        confidence: s.confidence,
        attributedToAgent: s.attributedToAgent,
        voice: s.attributedToAgent ? agent : "narrator",
        words: clip.words.map((w) => ({
          word: w.word,
          startMs: start + w.startMs,
          endMs: start + w.endMs,
        })),
      });
      cursor = start + clip.durationMs;
    });
    chapters.push({
      id: chapter.id,
      kind: chapter.kind,
      title: chapter.title,
      startMs: chapterStart,
      endMs: cursor,
    });
  });

  return {
    timeline: {
      version: 1,
      durationMs: cursor + timing.tailMs,
      leadInMs: timing.leadInMs,
      chapters,
      sentences,
    },
    gapsBeforeMs,
  };
}

/** The sentence playing at a time, or the most recent one during a pause. */
export function sentenceAt(timeline: Timeline, ms: number): TimelineSentence | null {
  let current: TimelineSentence | null = null;
  for (const s of timeline.sentences) {
    if (s.startMs <= ms) current = s;
    else break;
  }
  return current;
}

function vttTime(ms: number): string {
  const h = Math.floor(ms / 3_600_000);
  const m = Math.floor((ms % 3_600_000) / 60_000);
  const s = Math.floor((ms % 60_000) / 1000);
  const milli = Math.floor(ms % 1000);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${String(milli).padStart(3, "0")}`;
}

/** WebVTT captions, one cue per sentence, voice-tagged when an agent is quoted. */
export function toWebVtt(timeline: Timeline, agentName: (a: AgentKey) => string): string {
  const cues = timeline.sentences.map((s) => {
    const text = s.voice === "narrator" ? s.technical : `<v ${agentName(s.voice)}>${s.technical}`;
    return `${s.id}\n${vttTime(s.startMs)} --> ${vttTime(s.endMs)}\n${text}`;
  });
  return `WEBVTT\n\n${cues.join("\n\n")}\n`;
}
