import type { Clip, VoiceProvider, VoiceRole } from "./types";

/** Local open-weights TTS (Kokoro 82M via Kokoro-FastAPI). Free, offline, word timings. */
export class KokoroProvider implements VoiceProvider {
  readonly name = "kokoro";
  private readonly url = process.env.KOKORO_URL ?? "http://localhost:8880";

  voiceFor(role: VoiceRole): string {
    const voices: Record<VoiceRole, string> = {
      narrator: "af_heart",
      "claude-code": "bf_emma",
      cursor: "am_michael",
      devin: "am_fenrir",
      unknown: "af_bella",
    };
    return voices[role];
  }

  async synthesize(text: string, voice: string): Promise<Clip> {
    const res = await fetch(`${this.url}/dev/captioned_speech`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        model: "kokoro",
        input: text,
        voice,
        response_format: "mp3",
        stream: false,
        return_timestamps: true,
      }),
      signal: AbortSignal.timeout(120_000),
    });
    if (!res.ok) throw new Error(`Kokoro ${res.status}: ${(await res.text()).slice(0, 200)}`);
    const body = (await res.json()) as {
      audio: string;
      timestamps: { word: string; start_time: number; end_time: number }[];
    };
    const words = body.timestamps
      .filter((t) => /\w/.test(t.word))
      .map((t) => ({
        word: t.word,
        startMs: Math.round(t.start_time * 1000),
        endMs: Math.round(t.end_time * 1000),
      }));
    return {
      audio: Buffer.from(body.audio, "base64"),
      durationMs: words.at(-1)?.endMs ?? 0,
      words,
    };
  }
}
