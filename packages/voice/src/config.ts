import { ElevenLabsProvider } from "./elevenlabs";
import { KokoroProvider } from "./kokoro";
import type { VoiceProvider } from "./types";

let provider: VoiceProvider | null = null;

export function getVoiceProvider(): VoiceProvider {
  if (provider) return provider;
  const name = process.env.LUMI_TTS_PROVIDER ?? "kokoro";
  let created: VoiceProvider;
  if (name === "kokoro") created = new KokoroProvider();
  else if (name === "elevenlabs") created = new ElevenLabsProvider();
  else throw new Error(`LUMI_TTS_PROVIDER=${name} isn't supported; use "kokoro" or "elevenlabs".`);
  provider = created;
  return created;
}
