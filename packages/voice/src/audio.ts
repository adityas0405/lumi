import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);

/** Exact duration of an audio file, from ffprobe. */
export async function probeDurationMs(path: string): Promise<number> {
  const { stdout } = await run("ffprobe", [
    "-v",
    "error",
    "-show_entries",
    "format=duration",
    "-of",
    "csv=p=0",
    path,
  ]);
  const seconds = Number(stdout.trim());
  if (!Number.isFinite(seconds)) throw new Error(`ffprobe could not read ${path}`);
  return Math.round(seconds * 1000);
}

/**
 * Joins clips into one track with exact silences between them. Everything is
 * resampled to 44.1 kHz mono so the concat is sample-accurate.
 */
export async function concatWithGaps(
  parts: { path: string; gapBeforeMs: number }[],
  out: string,
): Promise<void> {
  const inputs: string[] = [];
  const filters: string[] = [];
  const labels: string[] = [];
  parts.forEach((p, i) => {
    inputs.push("-i", p.path);
    const delay = Math.max(0, Math.round(p.gapBeforeMs));
    filters.push(
      `[${i}:a]aresample=44100,aformat=channel_layouts=mono,adelay=${delay}:all=1[a${i}]`,
    );
    labels.push(`[a${i}]`);
  });
  filters.push(`${labels.join("")}concat=n=${parts.length}:v=0:a=1[out]`);
  await run(
    "ffmpeg",
    [
      "-y",
      "-v",
      "error",
      ...inputs,
      "-filter_complex",
      filters.join(";"),
      "-map",
      "[out]",
      "-c:a",
      "libmp3lame",
      "-b:a",
      "160k",
      out,
    ],
    {
      maxBuffer: 16 * 1024 * 1024,
    },
  );
}
