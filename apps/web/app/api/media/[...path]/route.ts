import { createReadStream, statSync } from "node:fs";
import { extname, join, normalize, resolve } from "node:path";
import { Readable } from "node:stream";
import { dataDir } from "@lumi/db";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const TYPES: Record<string, string> = {
  ".mp4": "video/mp4",
  ".jpg": "image/jpeg",
  ".png": "image/png",
  ".mp3": "audio/mpeg",
  ".vtt": "text/vtt",
};
const ALLOWED_ROOTS = ["renders", "shots"];

/** Streams rendered media to signed-in viewers, with byte ranges so the player can seek. */
export async function GET(req: Request, { params }: { params: Promise<{ path: string[] }> }) {
  if (!(await currentUser())) return new Response("unauthorized", { status: 401 });
  const { path } = await params;
  if (!ALLOWED_ROOTS.includes(path[0] ?? "")) return new Response("not found", { status: 404 });
  const root = resolve(dataDir());
  const file = normalize(join(root, ...path));
  if (!file.startsWith(root)) return new Response("forbidden", { status: 403 });
  let size: number;
  try {
    size = statSync(file).size;
  } catch {
    return new Response("not found", { status: 404 });
  }
  const type = TYPES[extname(file)] ?? "application/octet-stream";
  const range = /bytes=(\d*)-(\d*)/.exec(req.headers.get("range") ?? "");
  const headers: Record<string, string> = {
    "content-type": type,
    "accept-ranges": "bytes",
    "cache-control": "private, max-age=3600",
  };
  if (range) {
    const start = range[1] ? Number(range[1]) : 0;
    const end = range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
    const stream = Readable.toWeb(createReadStream(file, { start, end })) as ReadableStream;
    return new Response(stream, {
      status: 206,
      headers: {
        ...headers,
        "content-range": `bytes ${start}-${end}/${size}`,
        "content-length": String(end - start + 1),
      },
    });
  }
  return new Response(Readable.toWeb(createReadStream(file)) as ReadableStream, {
    headers: { ...headers, "content-length": String(size) },
  });
}
