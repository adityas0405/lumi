/** Dev tool: build the voiceover for a PR's latest script. npx tsx --env-file=.env demo/tools/voice-pr.ts 23 */
import { writeFileSync } from "node:fs";
import { join } from "node:path";
import type { TaskScript } from "@lumi/core";
import { closeDb, dataDir, getDb, scripts, tasks } from "@lumi/db";
import { buildVoiceover } from "@lumi/voice";
import { desc, eq } from "drizzle-orm";

const pr = Number(process.argv[2]);
const db = getDb();
const task = await db.query.tasks.findFirst({ where: eq(tasks.prNumber, pr) });
if (!task) throw new Error(`No task for #${pr}`);
const row = await db.query.scripts.findFirst({
  where: eq(scripts.subjectId, task.id),
  orderBy: desc(scripts.version),
});
if (!row) throw new Error("No script");
const out = dataDir("dev", `pr-${pr}`);
const t0 = Date.now();
const v = await buildVoiceover(row.body as TaskScript, task.agent, out, (d, n) =>
  process.stdout.write(`\r  voiced ${d}/${n}`),
);
writeFileSync(join(out, "timeline.json"), JSON.stringify(v.timeline, null, 2));
console.log(
  `\n#${pr}: ${(v.timeline.durationMs / 1000).toFixed(1)}s video, ${v.timeline.sentences.length} sentences, built in ${((Date.now() - t0) / 1000).toFixed(1)}s → ${v.audioPath}`,
);
for (const s of v.timeline.sentences)
  console.log(
    `  ${(s.startMs / 1000).toFixed(1).padStart(5)}–${(s.endMs / 1000).toFixed(1).padStart(5)} ${s.voice.padEnd(9)} ${s.scene.padEnd(12)} ${s.technical.slice(0, 70)}`,
  );
await closeDb();
