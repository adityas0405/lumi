/**
 * Planted-error consistency check: triage the planted-bug PR N times with fresh
 * model calls and report how often the bug is caught.
 *   npx tsx --env-file=.env demo/tools/planted-check.ts [runs=5]
 */
import { runTriage } from "@lumi/ai";
import { type Evidence, parseRef, triageRules } from "@lumi/core";
import { closeDb, evidence as evidenceTable, getDb, tasks } from "@lumi/db";
import { stopBoss } from "@lumi/pipeline";
import { eq, isNotNull } from "drizzle-orm";

const runs = Number(process.argv[2] ?? 5);
const db = getDb();
const planted = await db.query.tasks.findMany({ where: isNotNull(tasks.plantedError) });
for (const task of planted) {
  const rows = await db.select().from(evidenceTable).where(eq(evidenceTable.taskId, task.id));
  const evidence: Evidence[] = rows.map((r) => ({
    ref: r.ref,
    kind: r.kind,
    title: r.title,
    payload: r.payload,
    blobPath: r.blobPath,
  }));
  const signals = triageRules({
    files: task.files,
    hunks: evidence.flatMap((e) => (e.payload.kind === "diff_hunk" ? [e.payload.hunk] : [])),
    tests: evidence.flatMap((e) => (e.payload.kind === "test_case" ? [e.payload.test] : [])),
    ci: evidence.flatMap((e) =>
      e.payload.kind === "ci_step" && e.payload.step.name !== "tests" ? [e.payload.step] : [],
    ),
    ciPending: false,
    secretFindings: task.secretFindings,
    agentClaim: task.agentClaim,
  });
  console.log(`#${task.prNumber} ${task.title}\n  ground truth: ${task.plantedError}\n`);
  let caught = 0;
  for (let i = 1; i <= runs; i++) {
    const t = await runTriage({
      title: task.title,
      evidence,
      signals,
      variant: `planted-check-${Date.now()}-${i}`,
    });
    // Caught = flagged for a human AND a medium/high defect whose citation covers the
    // changed guard line (the added line containing the ">=" comparison).
    const guard = evidence
      .flatMap((e) =>
        e.payload.kind === "diff_hunk"
          ? e.payload.hunk.lines.map((l) => ({
              file: e.payload.kind === "diff_hunk" ? e.payload.hunk.file : "",
              l,
            }))
          : [],
      )
      .find(
        ({ file, l }) =>
          file === "src/payments/refunds.ts" &&
          l.type === "add" &&
          />=\s*order\.capturedCents/.test(l.text),
      );
    const guardLine = guard?.l.newLine ?? -1;
    const pointsAtGuard = t.verdict.suspectedDefects.some(
      (d) =>
        d.severity !== "low" &&
        d.refs.some((r) => {
          const p = parseRef(r);
          return (
            p?.type === "diff" &&
            p.path === "src/payments/refunds.ts" &&
            p.start <= guardLine &&
            guardLine <= p.end
          );
        }),
    );
    const ok = t.route !== "auto_pass" && pointsAtGuard;
    if (ok) caught++;
    console.log(
      `  run ${i}: ${ok ? "CAUGHT" : "MISSED"}  route=${t.route}  model=${t.model}  ${t.verdict.suspectedDefects[0]?.summary ?? "(no defect)"}`,
    );
  }
  console.log(`\n  ${caught}/${runs} caught`);
}
await stopBoss();
await closeDb();
