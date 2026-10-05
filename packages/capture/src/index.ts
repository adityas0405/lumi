import { execFile, spawn } from "node:child_process";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createServer } from "node:net";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import { isTestFile } from "@lumi/core";
import pixelmatch from "pixelmatch";
import { chromium } from "playwright";
import { PNG } from "pngjs";

const run = promisify(execFile);

/** How to build and serve a repo for screenshots. Defaults suit Vite apps. */
export interface PreviewConfig {
  install: string[];
  build: string[];
  serve: (port: number) => string[];
  routes: { label: string; path: string }[];
  viewport: { width: number; height: number };
}

export const VITE_PREVIEW: PreviewConfig = {
  install: ["npm", "ci", "--no-audit", "--no-fund", "--prefer-offline"],
  build: ["npx", "vite", "build"],
  serve: (port) => [
    "npx",
    "vite",
    "preview",
    "--port",
    String(port),
    "--strictPort",
    "--host",
    "127.0.0.1",
  ],
  routes: [{ label: "checkout", path: "/" }],
  viewport: { width: 1440, height: 900 },
};

export function hasUiChanges(paths: string[]): boolean {
  return paths.some((p) => /\.(tsx|jsx|css|scss|html|vue|svelte)$/.test(p) && !isTestFile(p));
}

async function freePort(): Promise<number> {
  return new Promise((resolve, reject) => {
    const s = createServer();
    s.listen(0, "127.0.0.1", () => {
      const port = (s.address() as { port: number }).port;
      s.close(() => resolve(port));
    });
    s.on("error", reject);
  });
}

async function checkout(
  repoFullName: string,
  sha: string,
  token: string,
  dir: string,
): Promise<void> {
  const git = (args: string[]) => run("git", args, { cwd: dir });
  await git(["init", "-q"]);
  await git([
    "remote",
    "add",
    "origin",
    `https://x-access-token:${token}@github.com/${repoFullName}.git`,
  ]);
  await git(["fetch", "-q", "--depth", "1", "origin", sha]);
  await git(["checkout", "-q", "FETCH_HEAD"]);
}

async function waitFor(url: string, timeoutMs: number): Promise<void> {
  const until = Date.now() + timeoutMs;
  while (Date.now() < until) {
    try {
      const r = await fetch(url);
      if (r.ok) return;
    } catch {}
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error(`Preview server at ${url} did not start`);
}

/** Builds one commit, serves it, and screenshots each route. The clone is deleted afterwards. */
async function shootCommit(
  repoFullName: string,
  sha: string,
  token: string,
  config: PreviewConfig,
): Promise<Map<string, Buffer>> {
  const dir = mkdtempSync(join(tmpdir(), "lumi-capture-"));
  let server: ReturnType<typeof spawn> | null = null;
  try {
    await checkout(repoFullName, sha, token, dir);
    const [ic, ...ia] = config.install;
    await run(ic!, ia, { cwd: dir, maxBuffer: 32 * 1024 * 1024 });
    const [bc, ...ba] = config.build;
    await run(bc!, ba, { cwd: dir, maxBuffer: 32 * 1024 * 1024 });
    const port = await freePort();
    const [sc, ...sa] = config.serve(port);
    server = spawn(sc!, sa, { cwd: dir, stdio: "ignore" });
    const base = `http://127.0.0.1:${port}`;
    await waitFor(base, 30_000);

    const browser = await chromium.launch();
    const shots = new Map<string, Buffer>();
    try {
      const page = await browser.newPage({ viewport: config.viewport, deviceScaleFactor: 1 });
      for (const route of config.routes) {
        await page.goto(base + route.path, { waitUntil: "networkidle" });
        await page.evaluate("document.fonts.ready");
        shots.set(route.label, await page.screenshot({ type: "png" }));
      }
    } finally {
      await browser.close();
    }
    return shots;
  } finally {
    server?.kill("SIGTERM");
    // Never keep a clone of customer code beyond the job.
    rmSync(dir, { recursive: true, force: true });
  }
}

/** Bounding box of pixels that differ between two same-size screenshots, or null. */
export function diffBox(
  before: Buffer,
  after: Buffer,
): { x: number; y: number; w: number; h: number } | null {
  const a = PNG.sync.read(before);
  const b = PNG.sync.read(after);
  if (a.width !== b.width || a.height !== b.height) return null;
  const { width, height } = a;
  const out = new PNG({ width, height });
  const changed = pixelmatch(a.data, b.data, out.data, width, height, { threshold: 0.1 });
  if (changed === 0) return null;
  let minX = width;
  let minY = height;
  let maxX = -1;
  let maxY = -1;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const i = (y * width + x) * 4;
      // pixelmatch paints differing pixels red (255, 0, 0).
      if (out.data[i] === 255 && out.data[i + 1] === 0 && out.data[i + 2] === 0) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }
  if (maxX < 0) return null;
  const box = { x: minX, y: minY, w: maxX - minX + 1, h: maxY - minY + 1 };
  // A change covering most of the page isn't a useful highlight.
  return box.w * box.h > width * height * 0.6 ? null : box;
}

export interface CapturedShot {
  label: string;
  variant: "before" | "after";
  path: string;
  width: number;
  height: number;
  highlight: { x: number; y: number; w: number; h: number } | null;
}

/** Before/after screenshots for a pull request, written under `outDir`. */
export async function captureBeforeAfter(input: {
  repoFullName: string;
  baseSha: string;
  headSha: string;
  token: string;
  outDir: string;
  config?: PreviewConfig;
}): Promise<CapturedShot[]> {
  const config = input.config ?? VITE_PREVIEW;
  const [before, after] = await Promise.all([
    shootCommit(input.repoFullName, input.baseSha, input.token, config),
    shootCommit(input.repoFullName, input.headSha, input.token, config),
  ]);
  const shots: CapturedShot[] = [];
  for (const route of config.routes) {
    const b = before.get(route.label);
    const a = after.get(route.label);
    if (!b || !a) continue;
    const highlight = diffBox(b, a);
    // Identical before/after means the change isn't visible on this route: no evidence.
    if (highlight === null && b.equals(a)) continue;
    for (const [variant, buf] of [
      ["before", b],
      ["after", a],
    ] as const) {
      const path = join(input.outDir, `${route.label}@${variant}.png`);
      writeFileSync(path, buf);
      const png = PNG.sync.read(buf);
      shots.push({
        label: route.label,
        variant,
        path,
        width: png.width,
        height: png.height,
        highlight: variant === "after" ? highlight : null,
      });
    }
  }
  return shots;
}

export function readPng(path: string): PNG {
  return PNG.sync.read(readFileSync(path));
}
