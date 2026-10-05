import type { Clip, VoiceProvider, VoiceRole, WordTiming } from "./types";

interface Alignment {
  characters: string[];
  character_start_times_seconds: number[];
  character_end_times_seconds: number[];
}

/** Groups character-level alignment into words (whitespace-separated). */
export function wordsFromAlignment(a: Alignment): WordTiming[] {
  const words: WordTiming[] = [];
  let current: WordTiming | null = null;
  a.characters.forEach((ch, i) => {
    const start = Math.round(a.character_start_times_seconds[i]! * 1000);
    const end = Math.round(a.character_end_times_seconds[i]! * 1000);
    if (/\s/.test(ch)) {
      if (current) words.push(current);
      current = null;
      return;
    }
    if (!current) current = { word: ch, startMs: start, endMs: end };
    else {
      current.word += ch;
      current.endMs = end;
    }
  });
  if (current) words.push(current);
  return words.filter((w) => /\w/.test(w.word));
}

/** ElevenLabs with character timestamps. Voices are configurable per role via env. */
export class ElevenLabsProvider implements VoiceProvider {
  readonly name = "elevenlabs";
  private readonly key = process.env.ELEVENLABS_API_KEY;
  private readonly model = process.env.ELEVENLABS_MODEL ?? "eleven_v4";

  constructor() {
    if (!this.key) throw new Error("ELEVENLABS_API_KEY is not set");
  }

  voiceFor(role: VoiceRole): string {
    const env: Record<VoiceRole, string> = {
      narrator: "ELEVENLABS_VOICE_NARRATOR",
      "claude-code": "ELEVENLABS_VOICE_CLAUDE_CODE",
      cursor: "ELEVENLABS_VOICE_CURSOR",
      devin: "ELEVENLABS_VOICE_DEVIN",
      unknown: "ELEVENLABS_VOICE_NARRATOR",
    };
    const id = process.env[env[role]];
    if (!id) throw new Error(`${env[role]} is not set`);
    return id;
  }

  async synthesize(text: string, voice: string): Promise<Clip> {
    const res = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${voice}/with-timestamps?output_format=mp3_44100_128`,
      {
        method: "POST",
        headers: { "content-type": "application/json", "xi-api-key": this.key! },
        body: JSON.stringify({ text, model_id: this.model }),
        signal: AbortSignal.timeout(120_000),
      },
    );
    if (!res.ok) throw new Error(`ElevenLabs ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = (await res.json()) as { audio_base64: string; alignment: Alignment };
    const words = wordsFromAlignment(body.alignment);
    const ends = body.alignment.character_end_times_seconds;
    return {
      audio: Buffer.from(body.audio_base64, "base64"),
      durationMs: Math.round((ends.at(-1) ?? 0) * 1000),
      words,
    };
  }
}
