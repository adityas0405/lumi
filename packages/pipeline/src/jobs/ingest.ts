import { hasUiChanges } from "@lumi/capture";
import { getDb, tasks } from "@lumi/db";
import { fetchPullRequest, normalizePullRequest, repoOctokit } from "@lumi/github";
import { eq } from "drizzle-orm";
import { confirmRollbackMerged } from "../incidents";
import { log } from "../log";
import { recordPullRequestOutcomes } from "../outcomes";
import { enqueue, enqueueAfter, type JobData } from "../queue";
import { findRepo, setTaskStatus, upsertRepo, upsertTask } from "../store";

/** Seconds between CI re-checks while checks are still running. */
const CI_RECHECK_SECONDS = 20;

/**
 * Ingests one pull request: fetches it from GitHub, normalizes and redacts it,
 * and stores the task with its evidence. Re-schedules itself while CI is running
 * so test results land as soon as they exist.
 */
export async function ingestPullRequest(data: JobData["ingest.pr"]): Promise<{ taskId: string }> {
  const { octokit, installationId } = await repoOctokit(data.repo, data.installationId);
  let repo = await findRepo(data.repo);
  if (!repo) {
    const [owner, name] = data.repo.split("/") as [string, string];
    const { data: gh } = await octokit.rest.repos.get({ owner, repo: name });
    repo = await upsertRepo({
      githubId: gh.id,
      fullName: gh.full_name,
      installationId,
      defaultBranch: gh.default_branch,
    });
  }

  const raw = await fetchPullRequest(octokit, data.repo, data.number);
  const { task, secretFindings, ciPending } = normalizePullRequest(raw);
  const { id, created, headChanged, revertOf, previousStatus } = await upsertTask(
    repo.id,
    repo.settings,
    task,
    secretFindings,
  );
  const { reverted } = await recordPullRequestOutcomes(id);
  if (reverted)
    await confirmRollbackMerged(reverted, {
      prNumber: task.prNumber,
      prUrl: task.prUrl,
      by: task.authorLogin,
    });

  log.info(
    {
      repo: data.repo,
      pr: data.number,
      taskId: id,
      agent: task.agent,
      evidence: task.evidence.length,
      ciPending,
      reason: data.reason,
    },
    created ? "task created" : "task refreshed",
  );

  // Same code as last time (a merge, label or CI re-run): the review stands, or is already
  // under way. Only new commits, a first ingest, or a failed review start one.
  const reviewed = previousStatus !== null && !["ingesting", "failed"].includes(previousStatus);
  if (!created && !headChanged && reviewed) {
    log.info(
      { repo: data.repo, pr: data.number, taskId: id },
      "code unchanged; keeping the review",
    );
    return { taskId: id };
  }

  if (revertOf) {
    // A rollback gets a light entry linked to the change it undoes: no triage, no video.
    const target = await getDb().query.tasks.findFirst({ where: eq(tasks.id, revertOf) });
    await setTaskStatus(id, "ready", {
      progress: 1,
      detail: target?.prNumber ? `Rollback of #${target.prNumber}` : "Rollback",
    });
  } else if (ciPending) {
    await setTaskStatus(id, "ingesting", { progress: 0.1, detail: "Waiting for CI to finish" });
    await enqueueAfter(
      "ingest.pr",
      { ...data, installationId, reason: "ci-recheck" },
      CI_RECHECK_SECONDS,
      {
        singletonKey: `ci-recheck:${data.repo}#${data.number}`,
        singletonSeconds: CI_RECHECK_SECONDS,
      },
    );
  } else {
    const key = `${id}:${task.headSha ?? ""}`;
    if (task.baseSha && task.headSha && hasUiChanges(task.files.map((f) => f.path))) {
      await setTaskStatus(id, "ingesting", {
        progress: 0.15,
        detail: "Capturing before and after screenshots",
      });
      await enqueue("review.capture", { taskId: id }, { singletonKey: `capture:${key}` });
    } else {
      await setTaskStatus(id, "triaging", { progress: 0.2, detail: "Queued for triage" });
      await enqueue("review.triage", { taskId: id }, { singletonKey: `triage:${key}` });
    }
  }
  return { taskId: id };
}
