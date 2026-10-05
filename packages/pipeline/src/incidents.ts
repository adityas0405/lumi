import { execFile } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import {
  type AgentKey,
  correlate,
  type DeployForCorrelation,
  type IncidentInput,
  PERSONAS,
  parseRef,
  type TaskForCorrelation,
} from "@lumi/core";
import {
  agents,
  deploys,
  evidence,
  getDb,
  incidents,
  outcomes,
  repos,
  tasks,
  triageResults,
} from "@lumi/db";
import { repoOctokit } from "@lumi/github";
import { and, desc, eq, inArray } from "drizzle-orm";
import { publish } from "./events";
import { log } from "./log";
import { recordOutcome } from "./outcomes";

const run = promisify(execFile);

/** Records an incident, finds the agent change behind it, and raises the alert. */
export async function createIncident(
  input: IncidentInput,
  repoFullName?: string,
): Promise<{ incidentId: string }> {
  const db = getDb();
  const repo = repoFullName
    ? await db.query.repos.findFirst({ where: eq(repos.fullName, repoFullName) })
    : await db.query.repos.findFirst({ orderBy: desc(repos.createdAt) });
  if (!repo) throw new Error("No repository to correlate the incident with");

  const deployRows = await db
    .select()
    .from(deploys)
    .where(
      and(eq(deploys.repoId, repo.id), eq(deploys.environment, input.environment ?? "production")),
    );
  const taskIds = [...new Set(deployRows.flatMap((d) => d.taskIds))];
  const [taskRows, evRows, triRows] = taskIds.length
    ? await Promise.all([
        db.select().from(tasks).where(inArray(tasks.id, taskIds)),
        db
          .select({ taskId: evidence.taskId, ref: evidence.ref })
          .from(evidence)
          .where(and(inArray(evidence.taskId, taskIds), eq(evidence.kind, "diff_hunk"))),
        db
          .select()
          .from(triageResults)
          .where(inArray(triageResults.taskId, taskIds))
          .orderBy(desc(triageResults.createdAt)),
      ])
    : [[], [], []];
  const forCorrelation: TaskForCorrelation[] = taskRows.map((t) => ({
    id: t.id,
    title: t.title,
    agent: t.agent,
    route: triRows.find((r) => r.taskId === t.id)?.route ?? null,
    changes: evRows
      .filter((e) => e.taskId === t.id)
      .flatMap((e) => {
        const p = parseRef(e.ref);
        return p?.type === "diff" ? [{ path: p.path, start: p.start, end: p.end }] : [];
      }),
  }));
  const deployList: DeployForCorrelation[] = deployRows.map((d) => ({
    id: d.id,
    sha: d.sha,
    deployedAt: d.deployedAt,
    taskIds: d.taskIds,
  }));
  const result = correlate(input, deployList, forCorrelation);

  const [row] = await db
    .insert(incidents)
    .values({
      repoId: repo.id,
      source: input.source,
      severity: input.severity,
      title: input.title,
      service: input.service,
      environment: input.environment,
      stats: { ...input.stats, url: input.url, tags: input.tags },
      frames: input.frames,
      deployId: result.deploy?.id ?? null,
      suspects: result.suspects.map((s) => ({
        taskId: s.taskId,
        score: s.score,
        confidence: s.confidence,
        reasons: s.reasons,
      })),
      startedAt: new Date(input.startedAt),
    })
    .returning({ id: incidents.id });
  const incidentId = row!.id;

  const top = result.suspects[0];
  if (top && top.confidence !== "low") {
    await recordOutcome({
      taskId: top.taskId,
      kind: "incident_linked",
      detail: `Suspected cause of "${input.title}" (${top.confidence} confidence)`,
      ref: incidentId,
      occurredAt: new Date(input.startedAt),
    });
  }
  await publish({ type: "incident.created", incidentId });
  log.warn(
    {
      incidentId,
      title: input.title,
      severity: input.severity,
      suspect: top?.taskId,
      confidence: top?.confidence,
      minutesSinceDeploy: result.minutesSinceDeploy,
    },
    "incident",
  );

  if (process.env.SLACK_BOT_TOKEN && input.severity !== "sev3") {
    const { postIncidentToSlack } = await import("./slack");
    await postIncidentToSlack(incidentId).catch((err) =>
      log.error({ err: String(err) }, "Slack incident alert failed"),
    );
  }
  return { incidentId };
}

async function addAction(
  incidentId: string,
  action: { kind: string; by: string; ref?: string; detail?: string },
) {
  const db = getDb();
  const inc = await db.query.incidents.findFirst({ where: eq(incidents.id, incidentId) });
  if (!inc) throw new Error("Incident not found");
  await db
    .update(incidents)
    .set({
      actions: [...inc.actions, { ...action, at: new Date().toISOString() }],
      status: action.kind === "resolve" ? "resolved" : "mitigating",
    })
    .where(eq(incidents.id, incidentId));
  await publish({ type: "incident.created", incidentId });
}

/**
 * A merged revert of a suspected change confirms the suspicion: every incident that
 * linked the change records that its rollback merged.
 */
export async function confirmRollbackMerged(
  taskId: string,
  revert: { prNumber: number | null; prUrl: string | null; by: string | null },
): Promise<void> {
  const linked = await getDb()
    .select({ ref: outcomes.ref })
    .from(outcomes)
    .where(and(eq(outcomes.taskId, taskId), eq(outcomes.kind, "incident_linked")));
  for (const { ref } of linked) {
    if (!ref) continue;
    const inc = await getDb().query.incidents.findFirst({ where: eq(incidents.id, ref) });
    if (!inc || inc.actions.some((a) => a.kind === "rollback_merged")) continue;
    await addAction(ref, {
      kind: "rollback_merged",
      by: revert.by ?? "github",
      ref: revert.prUrl ?? undefined,
      detail: revert.prNumber ? `Revert PR #${revert.prNumber} merged` : "Revert merged",
    });
  }
}

/**
 * Rolls back the suspected change: calls the repo's rollback webhook if one is
 * configured, otherwise opens a revert pull request (made in a temporary clone
 * that is deleted afterwards).
 */
export async function rollbackIncident(
  incidentId: string,
  by: string,
): Promise<{ url: string | null; method: string }> {
  const db = getDb();
  const inc = await db.query.incidents.findFirst({ where: eq(incidents.id, incidentId) });
  const suspect = inc?.suspects[0];
  if (!inc || !suspect) throw new Error("No suspected change to roll back");
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, suspect.taskId) });
  const repo = task ? await db.query.repos.findFirst({ where: eq(repos.id, task.repoId) }) : null;
  if (!task || !repo || !task.mergeCommitSha || !task.prNumber)
    throw new Error("The suspected change has no merge commit to revert");

  if (repo.settings.rollbackWebhookUrl) {
    const r = await fetch(repo.settings.rollbackWebhookUrl, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        incidentId,
        repo: repo.fullName,
        revert: task.mergeCommitSha,
        pullRequest: task.prNumber,
        requestedBy: by,
      }),
    });
    if (!r.ok) throw new Error(`Rollback webhook returned ${r.status}`);
    await addAction(incidentId, { kind: "rollback", by, detail: "rollback webhook called" });
    return { url: null, method: "webhook" };
  }

  const { octokit } = await repoOctokit(repo.fullName, repo.installationId);
  const { token } = (await octokit.auth({ type: "installation" })) as { token: string };
  const [owner, name] = repo.fullName.split("/") as [string, string];
  const branch = `lumi/revert-pr-${task.prNumber}-${Date.now().toString(36)}`;
  const dir = mkdtempSync(join(tmpdir(), "lumi-revert-"));
  const git = (args: string[]) => run("git", args, { cwd: dir });
  try {
    await git(["init", "-q", "-b", repo.defaultBranch]);
    await git(["config", "user.name", "Lumi"]);
    await git(["config", "user.email", "lumi@users.noreply.github.com"]);
    await git([
      "remote",
      "add",
      "origin",
      `https://x-access-token:${token}@github.com/${repo.fullName}.git`,
    ]);
    await git(["fetch", "-q", "--depth", "50", "origin", repo.defaultBranch]);
    await git(["checkout", "-q", "-b", branch, `origin/${repo.defaultBranch}`]);
    const { stdout } = await git(["rev-list", "--parents", "-n", "1", task.mergeCommitSha]);
    const isMerge = stdout.trim().split(" ").length > 2;
    await git(["revert", "--no-edit", ...(isMerge ? ["-m", "1"] : []), task.mergeCommitSha]);
    await git(["push", "-q", "origin", branch]);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  const { data: pr } = await octokit.rest.pulls.create({
    owner,
    repo: name,
    head: branch,
    base: repo.defaultBranch,
    title: `Revert "${task.title}"`,
    body: `Rolls back #${task.prNumber}, the suspected cause of a production incident:\n\n> ${inc.title}\n\nRequested by @${by} in Lumi.`,
  });
  await octokit.rest.issues.createComment({
    owner,
    repo: name,
    issue_number: task.prNumber,
    body: `This change is the suspected cause of a production incident (${inc.title}). @${by} opened a rollback in Lumi: #${pr.number}.`,
  });
  await addAction(incidentId, {
    kind: "rollback",
    by,
    ref: pr.html_url,
    detail: `Revert PR #${pr.number}`,
  });
  log.warn({ incidentId, revertPr: pr.number, by }, "rollback opened");
  return { url: pr.html_url, method: "revert-pr" };
}

/**
 * Pauses an agent: Lumi marks it paused, labels and comments on its open pull
 * requests, and SDK review requests from it are held. Lumi can't stop a
 * third-party agent's own process; this is the signal its workflow should honour.
 */
export async function pauseAgent(
  agent: AgentKey,
  by: string,
  incidentId?: string,
): Promise<{ openPrs: number }> {
  const db = getDb();
  await db.update(agents).set({ pausedAt: new Date(), pausedBy: by }).where(eq(agents.key, agent));
  const open = await db
    .select()
    .from(tasks)
    .where(and(eq(tasks.agent, agent), eq(tasks.prState, "open")));
  for (const t of open) {
    const repo = await db.query.repos.findFirst({ where: eq(repos.id, t.repoId) });
    if (!repo || !t.prNumber) continue;
    try {
      const { octokit } = await repoOctokit(repo.fullName, repo.installationId);
      const [owner, name] = repo.fullName.split("/") as [string, string];
      await octokit.rest.issues.addLabels({
        owner,
        repo: name,
        issue_number: t.prNumber,
        labels: ["lumi:paused"],
      });
      await octokit.rest.issues.createComment({
        owner,
        repo: name,
        issue_number: t.prNumber,
        body: `${PERSONAS[agent].name} was paused in Lumi by @${by}${incidentId ? " during a production incident" : ""}. Please hold further changes until it's resumed.`,
      });
    } catch (err) {
      log.warn({ err: String(err), pr: t.prNumber }, "couldn't label a paused agent's PR");
    }
  }
  if (incidentId)
    await addAction(incidentId, { kind: "pause_agent", by, detail: PERSONAS[agent].name });
  log.warn({ agent, by, openPrs: open.length }, "agent paused");
  return { openPrs: open.length };
}

export async function resumeAgent(agent: AgentKey): Promise<void> {
  await getDb().update(agents).set({ pausedAt: null, pausedBy: null }).where(eq(agents.key, agent));
}

export async function resolveIncident(incidentId: string, by: string): Promise<void> {
  await addAction(incidentId, { kind: "resolve", by });
}
