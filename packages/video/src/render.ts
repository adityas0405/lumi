import { createReadStream, statSync } from "node:fs";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { extname, join, normalize, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { bundle } from "@remotion/bundler";
import { renderMedia, renderStill, selectComposition } from "@remotion/renderer";
import type { DigestVideoProps, TaskVideoProps } from "./props";

const ENTRY = fileURLToPath(new URL("./remotion/index.ts", import.meta.url));

let bundled: Promise<string> | null = null;

/** Webpack-bundles the Remotion project once per process. */
export function getBundle(): Promise<string> {
  bundled ??= bundle({ entryPoint: ENTRY, onProgress: () => undefined });
  return bundled;
}

const TYPES: Record<string, string> = {
  ".mp3": "audio/mpeg",
  ".wav": "audio/wav",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".webm": "video/webm",
  ".mp4": "video/mp4",
};

/**
 * Serves render assets (voice tracks, screenshots) to the headless browser on
 * 127.0.0.1 only. Supports byte ranges, which media elements request.
 */
export class AssetServer {
  private server: Server | null = null;
  private base = "";

  constructor(private readonly root: string) {}

  async start(): Promise<void> {
    if (this.server) return;
    const root = resolve(this.root);
    this.server = createServer((req, res) => {
      const path = normalize(join(root, decodeURIComponent((req.url ?? "/").split("?")[0]!)));
      if (!path.startsWith(root)) {
        res.writeHead(403).end();
        return;
      }
      let size: number;
      try {
        size = statSync(path).size;
      } catch {
        res.writeHead(404).end();
        return;
      }
      const type = TYPES[extname(path)] ?? "application/octet-stream";
      const range = /bytes=(\d*)-(\d*)/.exec(req.headers.range ?? "");
      if (range) {
        const start = range[1] ? Number(range[1]) : 0;
        const end = range[2] ? Number(range[2]) : size - 1;
        res.writeHead(206, {
          "content-type": type,
          "content-range": `bytes ${start}-${end}/${size}`,
          "accept-ranges": "bytes",
          "content-length": end - start + 1,
        });
        createReadStream(path, { start, end }).pipe(res);
      } else {
        res.writeHead(200, {
          "content-type": type,
          "content-length": size,
          "accept-ranges": "bytes",
        });
        createReadStream(path).pipe(res);
      }
    });
    await new Promise<void>((r) => this.server!.listen(0, "127.0.0.1", r));
    this.base = `http://127.0.0.1:${(this.server.address() as AddressInfo).port}`;
  }

  url(absPath: string): string {
    const rel = resolve(absPath)
      .slice(resolve(this.root).length)
      .split("/")
      .map(encodeURIComponent)
      .join("/");
    return `${this.base}${rel}`;
  }

  async stop(): Promise<void> {
    await new Promise<void>((r) => (this.server ? this.server.close(() => r()) : r()));
    this.server = null;
  }
}

export interface RenderResult {
  videoPath: string;
  posterPath: string;
  durationMs: number;
  renderMs: number;
}

export function renderTaskVideo(
  props: TaskVideoProps,
  outDir: string,
  onProgress?: (fraction: number) => void,
): Promise<RenderResult> {
  return renderComposition("TaskVideo", props, outDir, onProgress);
}

export function renderDigestVideo(
  props: DigestVideoProps,
  outDir: string,
  onProgress?: (fraction: number) => void,
): Promise<RenderResult> {
  return renderComposition("DigestVideo", props, outDir, onProgress);
}

async function renderComposition(
  id: "TaskVideo" | "DigestVideo",
  props: TaskVideoProps | DigestVideoProps,
  outDir: string,
  onProgress?: (fraction: number) => void,
): Promise<RenderResult> {
  const started = Date.now();
  const serveUrl = await getBundle();
  const composition = await selectComposition({ serveUrl, id, inputProps: props });
  const videoPath = join(outDir, "video.mp4");
  await renderMedia({
    serveUrl,
    composition,
    inputProps: props,
    codec: "h264",
    crf: 20,
    audioBitrate: "160k",
    outputLocation: videoPath,
    concurrency: Number(process.env.LUMI_RENDER_CONCURRENCY ?? 6),
    onProgress: ({ progress }) => onProgress?.(progress),
  });
  // Poster: the title card, just before the narration begins.
  const posterPath = join(outDir, "poster.jpg");
  await renderStill({
    serveUrl,
    composition,
    inputProps: props,
    output: posterPath,
    frame: Math.max(0, Math.round(((props.timeline.leadInMs - 900) / 1000) * composition.fps)),
    imageFormat: "jpeg",
    jpegQuality: 88,
  });
  return {
    videoPath,
    posterPath,
    durationMs: props.timeline.durationMs,
    renderMs: Date.now() - started,
  };
}

/** Renders single frames, for QA contact sheets. */
export async function renderFrames(
  props: TaskVideoProps,
  frames: number[],
  outDir: string,
): Promise<string[]> {
  const serveUrl = await getBundle();
  const composition = await selectComposition({ serveUrl, id: "TaskVideo", inputProps: props });
  const paths: string[] = [];
  for (const frame of frames) {
    const output = join(outDir, `frame-${String(frame).padStart(5, "0")}.png`);
    await renderStill({
      serveUrl,
      composition,
      inputProps: props,
      output,
      frame,
      imageFormat: "png",
    });
    paths.push(output);
  }
  return paths;
}

export function probeSize(path: string): number {
  return statSync(path).size;
}
