import type { Octokit } from "octokit";

export interface RawDeployment {
  id: number;
  sha: string;
  environment: string;
  createdAt: string;
  state: string;
  environmentUrl: string | null;
}

/** Recent deployments with their latest status, newest first. */
export async function fetchDeployments(
  octokit: Octokit,
  repoFullName: string,
  environment = "production",
  limit = 30,
): Promise<RawDeployment[]> {
  const [owner, repo] = repoFullName.split("/") as [string, string];
  const { data } = await octokit.rest.repos.listDeployments({
    owner,
    repo,
    environment,
    per_page: limit,
  });
  return Promise.all(
    data.map(async (d) => {
      const { data: statuses } = await octokit.rest.repos.listDeploymentStatuses({
        owner,
        repo,
        deployment_id: d.id,
        per_page: 1,
      });
      const latest = statuses[0];
      return {
        id: d.id,
        sha: d.sha,
        environment: d.environment,
        createdAt: d.created_at,
        state: latest?.state ?? "pending",
        environmentUrl: latest?.environment_url || null,
      };
    }),
  );
}

/** Pull requests merged into `base` between two commits (exclusive..inclusive). */
export async function mergedPullsBetween(
  octokit: Octokit,
  repoFullName: string,
  fromSha: string | null,
  toSha: string,
): Promise<number[]> {
  const [owner, repo] = repoFullName.split("/") as [string, string];
  const shas: string[] = [toSha];
  if (fromSha) {
    const { data } = await octokit.rest.repos.compareCommits({
      owner,
      repo,
      base: fromSha,
      head: toSha,
      per_page: 250,
    });
    shas.push(...data.commits.map((c) => c.sha));
  } else {
    // First known deploy: everything in its recent history shipped with it.
    const { data } = await octokit.rest.repos.listCommits({
      owner,
      repo,
      sha: toSha,
      per_page: 100,
    });
    shas.push(...data.map((c) => c.sha));
  }
  const numbers = new Set<number>();
  for (const sha of new Set(shas)) {
    const { data } = await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
      owner,
      repo,
      commit_sha: sha,
    });
    for (const pr of data) if (pr.merged_at) numbers.add(pr.number);
  }
  return [...numbers].sort((a, b) => a - b);
}
