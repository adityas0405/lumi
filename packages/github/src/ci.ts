import type { CiStep, TestCaseResult } from "@lumi/core";
import { strFromU8, unzipSync } from "fflate";
import type { Octokit } from "octokit";
import { parseJunit } from "./junit";

export interface CiSnapshot {
  /** True while any check run for the commit is still queued or running. */
  pending: boolean;
  steps: CiStep[];
  tests: TestCaseResult[];
}

type Conclusion = CiStep["conclusion"];

function conclusionOf(status: string | null, conclusion: string | null): Conclusion {
  if (status !== "completed") return "pending";
  switch (conclusion) {
    case "success":
    case "failure":
    case "neutral":
    case "cancelled":
    case "skipped":
    case "timed_out":
      return conclusion;
    case "action_required":
    case "stale":
    case "startup_failure":
      return "failure";
    default:
      return "neutral";
  }
}

/**
 * Collects CI evidence for a commit: every check run, the steps of GitHub Actions
 * jobs, and test cases from any JUnit XML the workflow uploaded as an artifact.
 */
export async function fetchCi(
  octokit: Octokit,
  owner: string,
  repo: string,
  sha: string,
): Promise<CiSnapshot> {
  const steps: CiStep[] = [];
  const tests: TestCaseResult[] = [];

  const allChecks = await octokit.paginate(octokit.rest.checks.listForRef, {
    owner,
    repo,
    ref: sha,
    per_page: 100,
  });
  // Re-runs (and identical commits pushed again) leave older check runs on the same
  // SHA. Like GitHub's UI, only the latest run of each check counts.
  const latest = new Map<string, (typeof allChecks)[number]>();
  for (const c of allChecks) {
    const seen = latest.get(c.name);
    if (!seen || c.id > seen.id) latest.set(c.name, c);
  }
  const checks = [...latest.values()];
  const pending = checks.some((c) => c.status !== "completed");
  for (const c of checks) {
    steps.push({
      name: c.name,
      conclusion: conclusionOf(c.status, c.conclusion),
      url: c.html_url ?? null,
      summary: c.output?.summary ?? c.output?.title ?? null,
    });
  }

  const { data: runs } = await octokit.rest.actions.listWorkflowRunsForRepo({
    owner,
    repo,
    head_sha: sha,
    per_page: 20,
  });
  const latestRuns = new Map<number, (typeof runs.workflow_runs)[number]>();
  for (const run of runs.workflow_runs) {
    const seen = latestRuns.get(run.workflow_id);
    if (!seen || run.id > seen.id) latestRuns.set(run.workflow_id, run);
  }
  for (const run of latestRuns.values()) {
    const jobs = await octokit.paginate(octokit.rest.actions.listJobsForWorkflowRun, {
      owner,
      repo,
      run_id: run.id,
      per_page: 100,
    });
    for (const job of jobs) {
      // A job that failed without running a single step never started (billing,
      // runner outage, invalid workflow). That's "no CI", not "tests failed".
      if (job.conclusion === "failure" && (job.steps ?? []).length === 0) {
        const { data: annotations } = await octokit.rest.checks.listAnnotations({
          owner,
          repo,
          check_run_id: job.id,
        });
        const reason = annotations.find((a) => a.annotation_level === "failure")?.message ?? null;
        const check = steps.find((s) => s.name === job.name);
        if (check) {
          check.conclusion = "cancelled";
          check.summary = `CI never started${reason ? `: ${reason}` : ""}`;
        }
        continue;
      }
      for (const step of job.steps ?? []) {
        // Skip setup/teardown noise; keep the steps a reviewer cares about.
        if (/^(Set up job|Complete job|Post |Run actions\/)/.test(step.name)) continue;
        steps.push({
          name: `${job.name} / ${step.name}`,
          conclusion: conclusionOf(step.status, step.conclusion ?? null),
          url: job.html_url ?? null,
          summary: null,
        });
      }
    }

    if (run.status !== "completed") continue;
    const { data: artifacts } = await octokit.rest.actions.listWorkflowRunArtifacts({
      owner,
      repo,
      run_id: run.id,
    });
    for (const artifact of artifacts.artifacts) {
      if (artifact.expired || !/junit|test/i.test(artifact.name)) continue;
      const zip = await octokit.rest.actions.downloadArtifact({
        owner,
        repo,
        artifact_id: artifact.id,
        archive_format: "zip",
      });
      const files = unzipSync(new Uint8Array(zip.data as ArrayBuffer));
      for (const [name, bytes] of Object.entries(files)) {
        if (name.endsWith(".xml")) tests.push(...parseJunit(strFromU8(bytes)));
      }
    }
  }

  return { pending, steps, tests };
}
