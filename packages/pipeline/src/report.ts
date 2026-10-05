import { agentEvidence, evidence as evidenceTable, getDb, tasks } from "@lumi/db";
import { eq } from "drizzle-orm";
import { log } from "./log";
import { enqueue } from "./queue";
import { normalizeSdkReport, type SdkReport } from "./sdk";
import { expiryDate, findRepo, setTaskStatus, upsertRepo, upsertTask } from "./store";

/**
 * Handles `lumi.report(task, evidence)`. A report naming a pull request adds the
 * agent's evidence (decision log, session log, recordings) to that PR's review;
 * otherwise it becomes its own task and starts the review pipeline.
 */
export async function acceptSdkReport(
  report: SdkReport,
): Promise<{ taskId: string | null; created: boolean; attachedTo?: string }> {
  const { task, secretFindings } = normalizeSdkReport(report);

  if (report.task.pullRequest) {
    const externalId = `github:${report.task.repo}#${report.task.pullRequest}`;
    const db = getDb();
    // The agent's own description travels with the PR on GitHub; keep only its extra evidence.
    const extra = task.evidence.filter((e) => e.kind !== "agent_claim");
    for (const e of extra) {
      await db
        .insert(agentEvidence)
        .values({ externalId, ref: e.ref, evidence: e })
        .onConflictDoUpdate({
          target: [agentEvidence.externalId, agentEvidence.ref],
          set: { evidence: e },
        });
    }
    const existing = await db.query.tasks.findFirst({ where: eq(tasks.externalId, externalId) });
    if (existing) {
      const repo = await findRepo(report.task.repo);
      const expiresAt = expiryDate(repo!.settings);
      for (const e of extra) {
        await db
          .insert(evidenceTable)
          .values({
            taskId: existing.id,
            ref: e.ref,
            kind: e.kind,
            title: e.title,
            payload: e.payload,
            blobPath: e.blobPath,
            expiresAt,
          })
          .onConflictDoUpdate({
            target: [evidenceTable.taskId, evidenceTable.ref],
            set: { payload: e.payload, title: e.title, expiresAt },
          });
      }
      // New context changes the story: rewrite and re-render.
      await enqueue("review.script", { taskId: existing.id });
    }
    log.info(
      {
        externalId,
        evidence: extra.length,
        secrets: secretFindings.length,
        taskExists: Boolean(existing),
      },
      "sdk evidence attached to pull request",
    );
    return { taskId: existing?.id ?? null, created: false, attachedTo: externalId };
  }

  const repo =
    (await findRepo(task.repoFullName)) ??
    (await upsertRepo({ githubId: null, fullName: task.repoFullName }));
  const { id, created } = await upsertTask(repo.id, repo.settings, task, secretFindings);
  await setTaskStatus(id, "triaging", { progress: 0.2, detail: "Queued for triage" });
  await enqueue("review.triage", { taskId: id });
  log.info(
    { taskId: id, repo: task.repoFullName, agent: task.agent, evidence: task.evidence.length },
    "sdk report accepted",
  );
  return { taskId: id, created };
}
