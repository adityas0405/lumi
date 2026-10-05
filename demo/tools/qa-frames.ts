/**
 * QA: pulls a frame from the rendered MP4 at the middle of every sentence and
 * tiles them into one contact sheet.
 *   npx tsx --env-file=.env demo/tools/qa-frames.ts 22   → /tmp/qa-22.png
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Timeline } from "@lumi/core";
import { closeDb, getDb, renders, tasks } from "@lumi/db";
import { and, desc, eq } from "drizzle-orm";

const arg = process.argv[2]!;
const db = getDb();
// "digest" = the latest digest render; otherwise a PR number.
const subjectId =
  arg === "digest"
    ? (
        await db.query.renders.findFirst({
          where: and(eq(renders.subjectType, "digest"), eq(renders.status, "ready")),
          orderBy: desc(renders.createdAt),
        })
      )?.subjectId
    : (await db.query.tasks.findFirst({ where: eq(tasks.prNumber, Number(arg)) }))?.id;
if (!subjectId) throw new Error(`Nothing found for ${arg}`);
const pr = arg;
const r = await db.query.renders.findFirst({
  where: and(eq(renders.subjectId, subjectId), eq(renders.status, "ready")),
  orderBy: desc(renders.createdAt),
});
if (!r?.videoPath) throw new Error("No ready render");
const timeline = r.timeline as Timeline;
const dir = mkdtempSync(join(tmpdir(), "lumi-qa-"));
const times = [
  timeline.leadInMs - 900,
  ...timeline.sentences.map((s) => (s.startMs + s.endMs) / 2),
];
times.forEach((ms, i) => {
  execFileSync("ffmpeg", [
    "-v",
    "error",
    "-ss",
    (ms / 1000).toFixed(2),
    "-i",
    r.videoPath!,
    "-frames:v",
    "1",
    join(dir, `f${String(i).padStart(3, "0")}.png`),
  ]);
});
const cols = 3;
const rows = Math.ceil(times.length / cols);
const out = `/tmp/qa-${pr}.png`;
execFileSync("ffmpeg", [
  "-y",
  "-v",
  "error",
  "-pattern_type",
  "glob",
  "-i",
  join(dir, "f*.png"),
  "-vf",
  `scale=960:-1,tile=${cols}x${rows}:padding=8:color=0x333333`,
  "-frames:v",
  "1",
  out,
]);
rmSync(dir, { recursive: true, force: true });
console.log(`${times.length} frames → ${out}  (${r.videoPath})`);
await closeDb();
