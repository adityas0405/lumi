/**
 * Dev tool: voice and render one PR's latest script.
 *   npx tsx --env-file=.env demo/tools/render-pr.ts 23 --frames   QA frames at each sentence midpoint
 *   npx tsx --env-file=.env demo/tools/render-pr.ts 23             full MP4
 */
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type { Evidence, TaskScript } from "@lumi/core";
import {
  closeDb,
  dataDir,
  evidence as evidenceTable,
  getDb,
  scripts,
  tasks,
  triageResults,
} from "@lumi/db";
import { AssetServer, buildTaskVideoProps, renderFrames, renderTaskVideo } from "@lumi/video";
import { buildVoiceover } from "@lumi/voice";
import { desc, eq } from "drizzle-orm";

const pr = Number(process.argv[2]);
const framesOnly = process.argv.includes("--frames");
const db = getDb();
const task = await db.query.tasks.findFirst({ where: eq(tasks.prNumber, pr) });
if (!task) throw new Error(`No task for #${pr}`);
const script = await db.query.scripts.findFirst({
  where: eq(scripts.subjectId, task.id),
  orderBy: desc(scripts.version),
});
if (!script) throw new Error("No script");
const triage = await db.query.triageResults.findFirst({
  where: eq(triageResults.taskId, task.id),
  orderBy: desc(triageResults.createdAt),
});
const rows = await db.select().from(evidenceTable).where(eq(evidenceTable.taskId, task.id));
const evidence: Evidence[] = rows.map((r) => ({
  ref: r.ref,
  kind: r.kind,
  title: r.title,
  payload: r.payload,
  blobPath: r.blobPath,
}));

const out = dataDir("dev", `pr-${pr}`);
mkdirSync(out, { recursive: true });
const t0 = Date.now();
const voice = await buildVoiceover(script.body as TaskScript, task.agent, out);
console.log(
  `voice: ${(voice.timeline.durationMs / 1000).toFixed(1)}s in ${((Date.now() - t0) / 1000).toFixed(1)}s`,
);

const assets = new AssetServer(dataDir());
await assets.start();
const props = await buildTaskVideoProps({
  task: { ...task, files: task.files },
  script: script.body as TaskScript,
  timeline: voice.timeline,
  evidence,
  route: triage?.route ?? null,
  defectRefs: (triage?.suspectedDefects ?? []).flatMap((d) => d.refs),
  audioSrc: assets.url(voice.audioPath),
  assetUrl: (p) => assets.url(p),
});
writeFileSync(join(out, "props.json"), JSON.stringify(props, null, 2));

if (framesOnly) {
  const dir = join(out, "frames");
  rmSync(dir, { recursive: true, force: true });
  mkdirSync(dir, { recursive: true });
  const fps = 30;
  const picks = [
    Math.round(((voice.timeline.leadInMs - 900) / 1000) * fps),
    ...voice.timeline.sentences.map((s) => Math.round(((s.startMs + s.endMs) / 2 / 1000) * fps)),
  ];
  const t1 = Date.now();
  const paths = await renderFrames(props, picks, dir);
  console.log(`${paths.length} frames in ${((Date.now() - t1) / 1000).toFixed(1)}s → ${dir}`);
} else {
  const t1 = Date.now();
  let last = 0;
  const r = await renderTaskVideo(props, out, (p) => {
    const pct = Math.floor(p * 10);
    if (pct > last) {
      last = pct;
      process.stdout.write(`\r  rendering ${pct * 10}%`);
    }
  });
  console.log(
    `\nvideo: ${r.videoPath} (${(r.durationMs / 1000).toFixed(1)}s) rendered in ${((Date.now() - t1) / 1000).toFixed(1)}s`,
  );
}
await assets.stop();
await closeDb();
