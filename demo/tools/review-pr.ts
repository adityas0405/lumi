/**
 * Dev tool: triage and script one or more demo PRs and print the results.
 *   npx tsx --env-file=.env demo/tools/review-pr.ts 23 24
 */
import { closeDb, getDb, tasks } from "@lumi/db";
import { runMigrations } from "@lumi/db/migrate";
import { scriptTask, stopBoss, triageTask } from "@lumi/pipeline";
import { eq } from "drizzle-orm";

await runMigrations();
const onlyTriage = process.argv.includes("--triage-only");
for (const arg of process.argv.slice(2).filter((a) => /^\d+$/.test(a))) {
  const task = await getDb().query.tasks.findFirst({ where: eq(tasks.prNumber, Number(arg)) });
  if (!task) {
    console.log(`#${arg}: no task`);
    continue;
  }
  const t0 = Date.now();
  const t = await triageTask(task.id);
  console.log(
    `\n#${arg} ${task.title}\n  route=${t.route} score=${t.score.toFixed(2)} (${((Date.now() - t0) / 1000).toFixed(1)}s)`,
  );
  console.log(`  summary: ${t.verdict.summary}`);
  for (const d of t.verdict.suspectedDefects)
    console.log(`  DEFECT (${d.severity}) ${d.summary}: ${d.explanation} [${d.refs.join(", ")}]`);
  if (onlyTriage) continue;
  const t1 = Date.now();
  const s = await scriptTask(task.id);
  console.log(
    `  script: ${s.attempts} attempt(s), ${s.issues.length} issues (${((Date.now() - t1) / 1000).toFixed(1)}s)`,
  );
  for (const i of s.issues) console.log(`    ✗ ${i.message}`);
  for (const c of s.script.chapters) {
    console.log(`  ## ${c.title} [${c.kind}]`);
    for (const x of c.sentences)
      console.log(
        `    ${x.attributedToAgent ? "(agent) " : ""}${x.technical}  {${x.confidence}; ${x.refs.join(", ")}}`,
      );
  }
}
await stopBoss();
await closeDb();
