import { createHash } from "node:crypto";
import { existsSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type AgentKey,
  type ClipTiming,
  layoutTimeline,
  type Narration,
  type Timeline,
} from "@lumi/core";
import { dataDir, ensureDir, getDb, ttsCache } from "@lumi/db";
import { eq } from "drizzle-orm";
import { concatWithGaps, probeDurationMs } from "./audio";
import { getVoiceProvider } from "./config";
import { toSpeech } from "./speech";
import type { VoiceRole, WordTiming } from "./types";

const CONCURRENCY = 3;

async function mapLimit<T, R>(
  items: T[],
  limit: number,
  fn: (item: T, i: number) => Promise<R>,
): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]!, i);
    }
  });
  await Promise.all(workers);
  return out;
}

/** One cached clip per (provider, voice, text): re-rendering a video never re-synthesises. */
async function clipFor(
  written: string,
  role: VoiceRole,
): Promise<{ path: string; timing: ClipTiming }> {
  const provider = getVoiceProvider();
  const voice = provider.voiceFor(role);
  const text = toSpeech(written);
  const key = createHash("sha256")
    .update(JSON.stringify([provider.name, voice, process.env.ELEVENLABS_MODEL ?? "", text]))
    .digest("hex");
  const db = getDb();
  const hit = await db.query.ttsCache.findFirst({ where: eq(ttsCache.key, key) });
  if (hit && existsSync(hit.audioPath)) {
    return {
      path: hit.audioPath,
      timing: { durationMs: hit.durationMs, words: hit.alignment as WordTiming[] },
    };
  }
  const clip = await provider.synthesize(text, voice);
  const path = join(ensureDir(dataDir("tts")), `${key}.mp3`);
  writeFileSync(path, clip.audio);
  // The encoded file's real length, not the last word's end: trailing silence counts.
  const durationMs = await probeDurationMs(path);
  await db
    .insert(ttsCache)
    .values({ key, provider: provider.name, audioPath: path, alignment: clip.words, durationMs })
    .onConflictDoUpdate({
      target: ttsCache.key,
      set: { audioPath: path, alignment: clip.words, durationMs },
    });
  return { path, timing: { durationMs, words: clip.words } };
}

export interface Voiceover {
  timeline: Timeline;
  audioPath: string;
  provider: string;
}

/**
 * Voices every sentence (narrator, or the agent for its own quoted words), lays
 * the sentences out on a timeline and writes one audio track with matching gaps.
 */
export async function buildVoiceover(
  script: Narration,
  agent: AgentKey,
  outDir: string,
  onProgress?: (done: number, total: number) => void,
): Promise<Voiceover> {
  const sentences = script.chapters.flatMap((c) => c.sentences);
  let done = 0;
  const clips = await mapLimit(sentences, CONCURRENCY, async (s) => {
    const c = await clipFor(s.technical, s.attributedToAgent ? agent : "narrator");
    onProgress?.(++done, sentences.length);
    return c;
  });
  const timings = new Map(sentences.map((s, i) => [s.id, clips[i]!.timing]));
  const { timeline, gapsBeforeMs } = layoutTimeline(script, agent, timings);

  ensureDir(outDir);
  const audioPath = join(outDir, "voice.mp3");
  await concatWithGaps(
    sentences.map((s, i) => ({ path: clips[i]!.path, gapBeforeMs: gapsBeforeMs.get(s.id) ?? 0 })),
    audioPath,
  );
  return { timeline, audioPath, provider: getVoiceProvider().name };
}
