import type { AgentKey } from "@lumi/core";

export interface WordTiming {
  word: string;
  startMs: number;
  endMs: number;
}

export interface Clip {
  /** Encoded audio (mp3). */
  audio: Buffer;
  durationMs: number;
  words: WordTiming[];
}

/** Who is speaking: Lumi's narrator, or an agent quoted in its own words. */
export type VoiceRole = "narrator" | AgentKey;

export interface VoiceProvider {
  readonly name: string;
  /** Provider-specific voice id for a role. */
  voiceFor(role: VoiceRole): string;
  synthesize(text: string, voice: string): Promise<Clip>;
}
