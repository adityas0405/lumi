import { buildAllDigests, buildDigest } from "./digest";
import { ingestPullRequest } from "./jobs/ingest";
import { syncDeploys, syncRepo } from "./jobs/sync";
import { log } from "./log";
import { sweepHeldUp } from "./outcomes";
import { enqueue, getBoss, type JobData, QUEUES } from "./queue";
import { captureTask, renderTask, scriptTask, triageTask } from "./review";
import { setTaskStatus } from "./store";

/** Registers every job handler on this process. */
export async function startWorkers(): Promise<void> {
  const boss = await getBoss();
  const run =
    <T>(name: string, fn: (data: T) => Promise<unknown>) =>
    async (jobs: { id: string; data: T }[]) => {
      for (const job of jobs) {
        const started = Date.now();
        try {
          await fn(job.data);
          log.debug({ queue: name, jobId: job.id, ms: Date.now() - started }, "job done");
        } catch (err) {
          log.error({ queue: name, jobId: job.id, err }, "job failed");
          throw err;
        }
      }
    };

  await boss.work<JobData["ingest.pr"]>(
    QUEUES.ingestPr,
    { localConcurrency: 4 },
    run(QUEUES.ingestPr, ingestPullRequest),
  );
  await boss.work<JobData["sync.repo"]>(QUEUES.syncRepo, run(QUEUES.syncRepo, syncRepo));
  await boss.work<JobData["sync.deploys"]>(
    QUEUES.syncDeploys,
    run(QUEUES.syncDeploys, syncDeploys),
  );
  await boss.work<JobData["review.triage"]>(
    QUEUES.triage,
    { localConcurrency: 3 },
    run(QUEUES.triage, async ({ taskId }) => {
      await triageTask(taskId);
      await enqueue("review.script", { taskId });
    }),
  );
  await boss.work<JobData["review.script"]>(
    QUEUES.script,
    { localConcurrency: 3 },
    run(QUEUES.script, async ({ taskId }) => {
      await scriptTask(taskId);
      await setTaskStatus(taskId, "rendering", { progress: 0.6, detail: "Queued for rendering" });
      await enqueue("review.render", { taskId });
    }),
  );
  // Screenshots and renders are CPU-heavy: one at a time per worker.
  await boss.work<JobData["review.capture"]>(
    QUEUES.capture,
    { localConcurrency: 1 },
    run(QUEUES.capture, async ({ taskId }) => {
      await captureTask(taskId);
      await setTaskStatus(taskId, "triaging", { progress: 0.2, detail: "Queued for triage" });
      await enqueue("review.triage", { taskId });
    }),
  );
  await boss.work<JobData["review.render"]>(
    QUEUES.render,
    { localConcurrency: 1 },
    run(QUEUES.render, ({ taskId }: JobData["review.render"]) => renderTask(taskId)),
  );
  await boss.work<JobData["digest.build"]>(
    QUEUES.digest,
    { localConcurrency: 1 },
    run(QUEUES.digest, ({ repoId }: JobData["digest.build"]) =>
      repoId ? buildDigest({ repoId }) : buildAllDigests(),
    ),
  );
  // Every morning at the configured time (default 08:30 in the configured timezone).
  await boss.schedule(
    QUEUES.digest,
    process.env.LUMI_DIGEST_CRON ?? "30 8 * * *",
    {},
    { tz: process.env.LUMI_DIGEST_TZ ?? "America/Los_Angeles" },
  );
  await boss.work(
    QUEUES.sweep,
    { localConcurrency: 1 },
    run(QUEUES.sweep, () => sweepHeldUp()),
  );
  // Held-up work is checked hourly; a change counts after the repo's heldUpDays (default 3).
  await boss.schedule(QUEUES.sweep, process.env.LUMI_SWEEP_CRON ?? "15 * * * *", {});
  log.info({ queues: Object.values(QUEUES) }, "workers started");
}
