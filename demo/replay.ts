/**
 * pnpm demo:reset — rebuilds the demo from scratch:
 *
 *   1. Resets the GitHub repo: closes PRs, deletes branches and deployments,
 *      force-pushes a fresh `main` of the checkout service.
 *   2. Replays the scenario week: branches, backdated commits, PRs, merges, deploys.
 *   3. Waits for CI on every PR, resets Lumi's database and ingests everything.
 *   4. Records the simulated merge/decision/deploy times GitHub can't backdate.
 *
 * Flags:
 *   --ingest-only   keep the GitHub state from the last replay; only reset Lumi and re-ingest
 */
import { execFileSync } from "node:child_process";
import {
  cpSync,
  existsSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve } from "node:path";
import { closeDb, decisions, deploys, getDb, getPool, outcomes, repos, tasks } from "@lumi/db";
import { runMigrations } from "@lumi/db/migrate";
import { githubAppConfigured, repoOctokit } from "@lumi/github";
import {
  acceptSdkReport,
  enqueue,
  ingestPullRequest,
  recordOutcome,
  SdkReport,
  stopBoss,
  syncDeploys,
} from "@lumi/pipeline";
import { and, eq } from "drizzle-orm";
import { Octokit } from "octokit";
import {
  DEPLOYS,
  INITIAL_COMMIT,
  PRS,
  type ScenarioPr,
  scenarioAnchor,
  simDate,
} from "./scenario/index";

const ROOT = resolve(import.meta.dirname, "..");
const TEMPLATE = resolve(import.meta.dirname, "checkout-app");
const PR_ROOT = resolve(import.meta.dirname, "scenario/prs");
const STATE_FILE = resolve(import.meta.dirname, ".last-replay.json");
const REPO = process.env.LUMI_DEMO_REPO ?? "adityas0405/lumi-demo-checkout";
const [OWNER, NAME] = REPO.split("/") as [string, string];
const SKIP = new Set(["node_modules", "dist", "test-results", ".DS_Store"]);

interface ReplayState {
  repo: string;
  replayedAt: string;
  anchor: string;
  prs: Record<string, { number: number; headSha: string }>;
  deploys: { id: number; sha: string; at: string }[];
}

const step = (msg: string) => console.log(`\n\x1b[1m▸ ${msg}\x1b[0m`);
const info = (msg: string) => console.log(`  ${msg}`);
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

function sh(cwd: string, cmd: string, args: string[], env: Record<string, string> = {}): string {
  return execFileSync(cmd, args, {
    cwd,
    encoding: "utf8",
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
  }).trim();
}

function listFiles(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const name of readdirSync(d)) {
      if (SKIP.has(name)) continue;
      const p = join(d, name);
      if (statSync(p).isDirectory()) walk(p);
      else out.push(relative(dir, p));
    }
  };
  walk(dir);
  return out.sort();
}

function userToken(): string {
  return sh(ROOT, "gh", ["auth", "token"]);
}

// ---------------------------------------------------------------- GitHub reset

async function resetGithub(gh: Octokit): Promise<void> {
  step(`Resetting ${REPO}`);
  const open = await gh.paginate(gh.rest.pulls.list, {
    owner: OWNER,
    repo: NAME,
    state: "open",
    per_page: 100,
  });
  for (const pr of open)
    await gh.rest.pulls.update({
      owner: OWNER,
      repo: NAME,
      pull_number: pr.number,
      state: "closed",
    });
  info(`closed ${open.length} open pull requests`);

  const deployments = await gh.paginate(gh.rest.repos.listDeployments, {
    owner: OWNER,
    repo: NAME,
    per_page: 100,
  });
  for (const d of deployments) {
    await gh.rest.repos.createDeploymentStatus({
      owner: OWNER,
      repo: NAME,
      deployment_id: d.id,
      state: "inactive",
    });
    await gh.rest.repos.deleteDeployment({ owner: OWNER, repo: NAME, deployment_id: d.id });
  }
  info(`deleted ${deployments.length} deployments`);

  const branches = await gh.paginate(gh.rest.repos.listBranches, {
    owner: OWNER,
    repo: NAME,
    per_page: 100,
  });
  for (const b of branches) {
    if (b.name === "main") continue;
    await gh.rest.git.deleteRef({ owner: OWNER, repo: NAME, ref: `heads/${b.name}` });
  }
  info(`deleted ${branches.filter((b) => b.name !== "main").length} branches`);

  const labels: Record<string, string> = {
    "agent: devin": "10B981",
    payments: "D97757",
    checkout: "3B82F6",
    orders: "8B5CF6",
    ui: "EC4899",
    tests: "6B7280",
    docs: "6B7280",
    dependencies: "F59E0B",
  };
  const existing = new Set(
    (
      await gh.paginate(gh.rest.issues.listLabelsForRepo, {
        owner: OWNER,
        repo: NAME,
        per_page: 100,
      })
    ).map((l) => l.name),
  );
  for (const [name, color] of Object.entries(labels)) {
    if (!existing.has(name))
      await gh.rest.issues.createLabel({ owner: OWNER, repo: NAME, name, color });
  }
}

/** The issue a person filed for this work: reused across resets (found by title), reopened if closed. */
async function ensureIssue(gh: Octokit, issue: { title: string; body: string }): Promise<number> {
  const all = await gh.paginate(gh.rest.issues.listForRepo, {
    owner: OWNER,
    repo: NAME,
    state: "all",
    per_page: 100,
  });
  const found = all.find((i) => !i.pull_request && i.title === issue.title);
  if (found) {
    await gh.rest.issues.update({
      owner: OWNER,
      repo: NAME,
      issue_number: found.number,
      body: issue.body,
      state: "open",
    });
    return found.number;
  }
  const { data } = await gh.rest.issues.create({
    owner: OWNER,
    repo: NAME,
    title: issue.title,
    body: issue.body,
  });
  return data.number;
}

// ---------------------------------------------------------------- replay

async function replay(gh: Octokit, anchor: Date): Promise<ReplayState> {
  const token = userToken();
  const me = (await gh.rest.users.getAuthenticated()).data;
  const author = {
    name: me.name ?? me.login,
    email: `${me.id}+${me.login}@users.noreply.github.com`,
  };
  const work = mkdtempSync(join(tmpdir(), "lumi-replay-"));
  const git = (args: string[], at?: Date) =>
    sh(
      work,
      "git",
      args,
      at ? { GIT_AUTHOR_DATE: at.toISOString(), GIT_COMMITTER_DATE: at.toISOString() } : {},
    );
  const state: ReplayState = {
    repo: REPO,
    replayedAt: new Date().toISOString(),
    anchor: anchor.toISOString(),
    prs: {},
    deploys: [],
  };

  try {
    step("Writing a fresh main");
    git(["init", "-q", "-b", "main"]);
    git(["config", "user.name", author.name]);
    git(["config", "user.email", author.email]);
    git(["config", "commit.gpgsign", "false"]);
    git(["remote", "add", "origin", `https://x-access-token:${token}@github.com/${REPO}.git`]);
    for (const f of listFiles(TEMPLATE))
      cpSync(join(TEMPLATE, f), join(work, f), { recursive: true });
    git(["add", "-A"]);
    git(["commit", "-q", "-m", "Checkout service v1.4"], simDate(INITIAL_COMMIT, anchor));
    git(["push", "-q", "-f", "origin", "main"]);
    info(`main @ ${git(["rev-parse", "--short", "HEAD"])}`);

    // Every scenario event in time order: PR opens, merges and deploys.
    type Event =
      | { at: Date; kind: "open"; pr: ScenarioPr }
      | { at: Date; kind: "merge"; pr: ScenarioPr }
      | { at: Date; kind: "deploy"; index: number };
    const now = new Date();
    const events: Event[] = [
      ...PRS.map((pr) => ({ at: simDate(pr.openedAt, anchor), kind: "open" as const, pr })),
      ...PRS.filter((pr) => pr.mergedAt).map((pr) => ({
        at: simDate(pr.mergedAt!, anchor, now),
        kind: "merge" as const,
        pr,
      })),
      ...DEPLOYS.map((d, index) => ({
        at: simDate(d.at, anchor, now),
        kind: "deploy" as const,
        index,
      })),
    ].sort(
      (a, b) =>
        a.at.getTime() - b.at.getTime() || (a.kind === "deploy" ? 1 : b.kind === "deploy" ? -1 : 0),
    );

    for (const event of events) {
      if (event.kind === "open") {
        const pr = event.pr;
        step(`Opening "${pr.title}" (${pr.agent})`);
        git(["fetch", "-q", "origin", "main"]);
        git(["checkout", "-q", "-B", pr.branch, "origin/main"]);
        const dir = join(PR_ROOT, pr.dir);
        const remaining = new Set(listFiles(dir));
        for (const c of pr.commits) {
          const files = c.files ?? [...remaining];
          for (const f of files) {
            if (!remaining.delete(f)) throw new Error(`${pr.key}: ${f} listed twice or missing`);
            cpSync(join(dir, f), join(work, f), { recursive: true });
          }
          git(["add", "-A"]);
          git(["commit", "-q", "-m", c.message], simDate(c.at, anchor));
        }
        if (remaining.size)
          throw new Error(`${pr.key}: files not in any commit: ${[...remaining].join(", ")}`);
        git(["push", "-q", "-f", "origin", pr.branch]);
        const issue = await ensureIssue(gh, pr.issue);
        const { data } = await gh.rest.pulls.create({
          owner: OWNER,
          repo: NAME,
          head: pr.branch,
          base: "main",
          title: pr.title,
          body: `${pr.body}\n\nCloses #${issue}`,
        });
        if (pr.labels.length)
          await gh.rest.issues.addLabels({
            owner: OWNER,
            repo: NAME,
            issue_number: data.number,
            labels: pr.labels,
          });
        state.prs[pr.key] = { number: data.number, headSha: data.head.sha };
        info(`#${data.number} ${data.html_url}`);
      } else if (event.kind === "merge") {
        const { number } = state.prs[event.pr.key]!;
        // GitHub computes mergeability asynchronously right after a push.
        for (let i = 0; i < 10; i++) {
          const { data } = await gh.rest.pulls.get({
            owner: OWNER,
            repo: NAME,
            pull_number: number,
          });
          if (data.mergeable !== null) break;
          await sleep(1500);
        }
        await gh.rest.pulls.merge({
          owner: OWNER,
          repo: NAME,
          pull_number: number,
          merge_method: "merge",
        });
        info(`merged #${number} (${event.pr.key})`);
      } else {
        const { data: main } = await gh.rest.repos.getBranch({
          owner: OWNER,
          repo: NAME,
          branch: "main",
        });
        const { data: d } = await gh.rest.repos.createDeployment({
          owner: OWNER,
          repo: NAME,
          ref: main.commit.sha,
          environment: "production",
          auto_merge: false,
          required_contexts: [],
          description: `Deploy ${DEPLOYS[event.index]!.afterMerging.join(", ")}`,
        });
        if (!("id" in d)) throw new Error("Deployment was not created");
        await gh.rest.repos.createDeploymentStatus({
          owner: OWNER,
          repo: NAME,
          deployment_id: d.id,
          state: "success",
          description: "Deployed to production",
        });
        state.deploys.push({ id: d.id, sha: main.commit.sha, at: event.at.toISOString() });
        info(`deployed main @ ${main.commit.sha.slice(0, 7)} to production`);
      }
    }
  } finally {
    rmSync(work, { recursive: true, force: true });
  }
  writeFileSync(STATE_FILE, JSON.stringify(state, null, 2));
  return state;
}

// ---------------------------------------------------------------- CI + ingest

async function waitForCi(gh: Octokit, state: ReplayState): Promise<void> {
  step("Waiting for CI on every pull request");
  const shas = Object.values(state.prs).map((p) => p.headSha);
  const deadline = Date.now() + 10 * 60_000;
  const pending = new Set(shas);
  while (pending.size && Date.now() < deadline) {
    for (const sha of [...pending]) {
      const { data } = await gh.rest.checks.listForRef({ owner: OWNER, repo: NAME, ref: sha });
      if (data.total_count > 0 && data.check_runs.every((c) => c.status === "completed"))
        pending.delete(sha);
    }
    if (pending.size) {
      process.stdout.write(`\r  ${shas.length - pending.size}/${shas.length} finished`);
      await sleep(5000);
    }
  }
  process.stdout.write(`\r  ${shas.length - pending.size}/${shas.length} finished\n`);
  if (pending.size)
    info(`⚠ CI still running for ${pending.size} PRs; they'll be refreshed by webhooks`);
}

async function resetLumi(): Promise<void> {
  step("Resetting Lumi's database (caches kept)");
  await runMigrations();
  await getPool().query(`
    truncate table agent_evidence, outcomes, questions, decisions, renders, scripts, triage_results, evidence,
      incidents, deploys, digests, tasks, repos, webhook_events restart identity cascade`);
  await getPool().query("update agents set paused_at = null, paused_by = null");
  await getPool()
    .query("delete from pgboss.job")
    .catch(() => undefined);
}

/** What Claude Code's hook would send: the decisions it logged while working on each PR. */
async function reportDecisions(state: ReplayState): Promise<void> {
  step("Reporting agent decision logs through the Lumi SDK");
  for (const pr of PRS) {
    const entry = state.prs[pr.key];
    if (!entry || !pr.decisions?.length) continue;
    await acceptSdkReport(
      SdkReport.parse({
        task: {
          id: `session-${pr.key}`,
          title: pr.title,
          agent: pr.agent,
          repo: REPO,
          pullRequest: entry.number,
        },
        evidence: pr.decisions.map((d) => ({ kind: "decision", ...d })),
      }),
    );
    info(`#${entry.number}: ${pr.decisions.length} decision(s) from ${pr.agent}`);
  }
}

async function ingest(state: ReplayState, anchor: Date): Promise<void> {
  step("Ingesting into Lumi");
  const { installationId } = await repoOctokit(REPO);
  for (const pr of PRS) {
    const entry = state.prs[pr.key];
    if (!entry) continue;
    const { taskId } = await ingestPullRequest({
      repo: REPO,
      number: entry.number,
      installationId,
      reason: "demo-reset",
    });
    info(`#${entry.number} → task ${taskId.slice(0, 8)} (${pr.key})`);
  }
  await syncDeploys({ repo: REPO, installationId });

  step("Recording simulated times and earlier decisions");
  const db = getDb();
  const repo = await db.query.repos.findFirst({ where: eq(repos.fullName, REPO) });
  if (!repo) throw new Error("Repo missing after ingest");
  const replayedAt = new Date(state.replayedAt);
  const login = sh(ROOT, "gh", ["api", "user", "--jq", ".login"]);

  for (const pr of PRS) {
    const entry = state.prs[pr.key];
    if (!entry) continue;
    const task = await db.query.tasks.findFirst({
      where: and(eq(tasks.repoId, repo.id), eq(tasks.prNumber, entry.number)),
    });
    if (!task) continue;
    await db
      .update(tasks)
      .set({ plantedError: pr.plantedError ?? null })
      .where(eq(tasks.id, task.id));
    if (pr.mergedAt) {
      const mergedAt = simDate(pr.mergedAt, anchor, replayedAt);
      await db.update(tasks).set({ mergedAt }).where(eq(tasks.id, task.id));
      // Ingest recorded the real merge time; move it to the simulated one.
      await recordOutcome({
        taskId: task.id,
        kind: "merged",
        occurredAt: mergedAt,
        ref: task.mergeCommitSha,
      });
      await db
        .update(outcomes)
        .set({ occurredAt: mergedAt })
        .where(and(eq(outcomes.taskId, task.id), eq(outcomes.kind, "merged")));
    }
    if (pr.approvedAt) {
      const at = simDate(pr.approvedAt, anchor, replayedAt);
      await db.insert(decisions).values({
        taskId: task.id,
        kind: "approve",
        decidedBy: login,
        createdAt: at,
        deliveredAt: at,
      });
    }
  }
  for (const d of state.deploys) {
    await db
      .update(deploys)
      .set({ deployedAt: new Date(d.at) })
      .where(eq(deploys.githubDeploymentId, d.id));
  }
}

/**
 * Waits for the worker to finish reviewing every task (triage, then script).
 * The worker must be running: `pnpm --filter @lumi/worker start`.
 */
async function waitForReviews(): Promise<void> {
  step("Waiting for the worker to capture, triage, script, voice and render every task");
  const deadline = Date.now() + 30 * 60_000;
  let last = "";
  while (Date.now() < deadline) {
    const { rows } = await getPool().query<{ status: string; n: string }>(
      "select status, count(*) n from tasks group by status order by status",
    );
    const counts = Object.fromEntries(rows.map((r) => [r.status, Number(r.n)]));
    const total = rows.reduce((n, r) => n + Number(r.n), 0);
    const done = (counts.ready ?? 0) + (counts.decided ?? 0) + (counts.failed ?? 0);
    const line = rows.map((r) => `${r.status} ${r.n}`).join(", ");
    if (line !== last) {
      info(line);
      last = line;
    }
    if (done === total) return;
    await sleep(3000);
  }
  info("⚠ timed out; is the worker running? (pnpm --filter @lumi/worker start)");
}

/** The digest the demo opens with: the whole simulated week (first digest after a reset). */
async function buildWeekDigest(): Promise<void> {
  step("Building the daily digest");
  await enqueue("digest.build", {});
  const deadline = Date.now() + 10 * 60_000;
  while (Date.now() < deadline) {
    const { rows } = await getPool().query<{ status: string; d: number | null }>(
      "select status, duration_ms d from renders where subject_type = 'digest' order by created_at desc limit 1",
    );
    if (rows[0]?.status === "ready") {
      info(`digest ready (${Math.round((rows[0].d ?? 0) / 1000)}s)`);
      return;
    }
    if (rows[0]?.status === "failed") throw new Error("Digest render failed");
    await sleep(3000);
  }
  info("⚠ digest timed out");
}

async function summary(): Promise<void> {
  step("Done");
  const rows = await getDb().query.tasks.findMany({ orderBy: (t, { asc }) => [asc(t.occurredAt)] });
  const evidenceCounts = await getPool().query<{ task_id: string; n: string }>(
    "select task_id, count(*) n from evidence group by task_id",
  );
  const counts = new Map(evidenceCounts.rows.map((r) => [r.task_id, Number(r.n)]));
  const triage = await getPool().query<{ task_id: string; route: string }>(
    "select distinct on (task_id) task_id, route from triage_results order by task_id, created_at desc",
  );
  const routes = new Map(triage.rows.map((r) => [r.task_id, r.route]));
  const scriptRows = await getPool().query<{ subject_id: string; ok: boolean; attempts: number }>(
    "select distinct on (subject_id) subject_id, (validation->>'ok')::boolean ok, attempts from scripts order by subject_id, version desc",
  );
  const scriptsBy = new Map(scriptRows.rows.map((r) => [r.subject_id, r]));
  const renderRows = await getPool().query<{
    subject_id: string;
    status: string;
    duration_ms: number | null;
  }>(
    "select distinct on (subject_id) subject_id, status, duration_ms from renders order by subject_id, created_at desc",
  );
  const rendersBy = new Map(renderRows.rows.map((r) => [r.subject_id, r]));
  for (const t of rows) {
    const sc = scriptsBy.get(t.id);
    const script = sc ? (sc.ok ? "script ok" : "script INVALID") : "no script";
    const rr = rendersBy.get(t.id);
    const video = rr
      ? rr.status === "ready"
        ? `video ${Math.round((rr.duration_ms ?? 0) / 1000)}s`
        : `video ${rr.status}`
      : "no video";
    info(
      `#${String(t.prNumber).padEnd(3)} ${t.agent.padEnd(11)} ${t.prState.padEnd(6)} ${String(counts.get(t.id) ?? 0).padStart(3)} evidence  ${(routes.get(t.id) ?? "-").padEnd(11)} ${script.padEnd(14)} ${video.padEnd(10)} ${t.title}`,
    );
  }
  const d = await getDb().query.deploys.findMany({ orderBy: (x, { asc }) => [asc(x.deployedAt)] });
  for (const x of d)
    info(
      `deploy ${x.sha.slice(0, 7)} at ${x.deployedAt.toISOString()} shipped ${x.taskIds.length} task(s)`,
    );
}

// ---------------------------------------------------------------- main

async function main(): Promise<void> {
  if (!githubAppConfigured())
    throw new Error("GitHub App not configured. Run `pnpm setup:github-app` first.");
  process.env.LUMI_ROOT ??= ROOT;
  const gh = new Octokit({ auth: userToken() });
  try {
    await repoOctokit(REPO);
  } catch {
    throw new Error(
      `The Lumi GitHub App isn't installed on ${REPO}. Install it: https://github.com/apps/${process.env.GITHUB_APP_SLUG}/installations/new`,
    );
  }

  let state: ReplayState;
  let anchor: Date;
  if (process.argv.includes("--ingest-only")) {
    if (!existsSync(STATE_FILE))
      throw new Error("No previous replay found; run without --ingest-only.");
    state = JSON.parse(readFileSync(STATE_FILE, "utf8")) as ReplayState;
    anchor = new Date(state.anchor);
  } else {
    anchor = scenarioAnchor();
    await resetGithub(gh);
    state = await replay(gh, anchor);
  }
  await waitForCi(gh, state);
  await resetLumi();
  await reportDecisions(state);
  await ingest(state, anchor);
  if (!process.argv.includes("--no-wait")) {
    await waitForReviews();
    await buildWeekDigest();
  }
  await summary();
}

main()
  .catch((err) => {
    console.error(`\n\x1b[31m✗ ${err instanceof Error ? err.message : err}\x1b[0m`);
    process.exitCode = 1;
  })
  .finally(async () => {
    await stopBoss();
    await closeDb();
  });
