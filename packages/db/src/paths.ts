import { mkdirSync } from "node:fs";
import { isAbsolute, join, resolve } from "node:path";

/** Root for videos, audio and screenshots. Everything under it expires with retention. */
export function dataDir(...parts: string[]): string {
  const root = process.env.LUMI_ROOT ?? process.cwd();
  const base = process.env.LUMI_DATA_DIR ?? "./data";
  const dir = isAbsolute(base) ? base : resolve(root, base);
  const full = join(dir, ...parts);
  return full;
}

export function ensureDir(path: string): string {
  mkdirSync(path, { recursive: true });
  return path;
}
