import { fetchDeployments, mergedPullsBetween, repoOctokit } from "@lumi/github";
import { publish } from "../events";
import { log } from "../log";
import { enqueue, type JobData } from "../queue";
import { findRepo, upsertDeploy, upsertRepo } from "../store";

/** Enqueues ingestion of every recent pull request and refreshes deploys. */
export async function syncRepo(data: JobData["sync.repo"]): Promise<{ queued: number }> {
  const { octokit, installationId } = await repoOctokit(data.repo, data.installationId);
  const [owner, name] = data.repo.split("/") as [string, string];
  const { data: gh } = await octokit.rest.repos.get({ owner, repo: name });
  await upsertRepo({
    githubId: gh.id,
    fullName: gh.full_name,
    installationId,
    defaultBranch: gh.default_branch,
  });

  const pulls = await octokit.paginate(octokit.rest.pulls.list, {
    owner,
    repo: name,
    state: "all",
    sort: "updated",
    direction: "desc",
    per_page: 50,
  });
  for (const pr of pulls.slice(0, 50)) {
    if (pr.state === "closed" && !pr.merged_at) continue;
    await enqueue("ingest.pr", {
      repo: data.repo,
      number: pr.number,
      installationId,
      reason: "sync",
    });
  }
  await enqueue(
    "sync.deploys",
    { repo: data.repo, installationId },
    { singletonKey: `deploys:${data.repo}` },
  );
  log.info({ repo: data.repo, pulls: pulls.length }, "repo sync queued");
  return { queued: pulls.length };
}

/**
 * Records production deploys and which merged pull requests each one shipped
 * (everything merged between the previous successful deploy and this one).
 */
export async function syncDeploys(data: JobData["sync.deploys"]): Promise<{ deploys: number }> {
  const { octokit } = await repoOctokit(data.repo, data.installationId);
  const repo = await findRepo(data.repo);
  if (!repo) throw new Error(`Repo ${data.repo} not synced yet`);

  const all = await fetchDeployments(octokit, data.repo);
  // GitHub marks earlier deploys "inactive" once a newer one succeeds; they still shipped.
  const successful = all
    .filter((d) => d.state === "success" || d.state === "inactive")
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt));
  for (let i = 0; i < successful.length; i++) {
    const d = successful[i]!;
    const previousSha = successful[i - 1]?.sha ?? null;
    const prNumbers = await mergedPullsBetween(octokit, data.repo, previousSha, d.sha);
    await upsertDeploy({
      repoId: repo.id,
      githubDeploymentId: d.id,
      environment: d.environment,
      sha: d.sha,
      previousSha,
      status: d.state,
      environmentUrl: d.environmentUrl,
      deployedAt: new Date(d.createdAt),
      prNumbers,
    });
  }
  await publish({ type: "deploys.updated", repo: data.repo });
  log.info({ repo: data.repo, deploys: successful.length }, "deploys synced");
  return { deploys: successful.length };
}
