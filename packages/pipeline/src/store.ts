import type { NormalizedTask, TaskStatus } from "@lumi/core";
import {
  agentEvidence,
  type Db,
  deploys,
  evidence,
  getDb,
  type RepoSettings,
  repos,
  tasks,
} from "@lumi/db";
import { and, eq, inArray, like, ne, notInArray, or } from "drizzle-orm";
import { publish } from "./events";

export const DEFAULT_SETTINGS: RepoSettings = {
  retentionDays: Number(process.env.LUMI_RETENTION_DAYS ?? 30),
  rollbackWebhookUrl: null,
  areas: {
    "src/payments": "Payments",
    "src/checkout": "Checkout",
    "src/orders": "Orders",
    "src/ui": "UI",
  },
  mentionPrefixes: {},
  closeOnReject: false,
  heldUpDays: 3,
};

export function expiryDate(settings: RepoSettings, from = new Date()): Date {
  return new Date(from.getTime() + settings.retentionDays * 86_400_000);
}

export async function upsertRepo(
  input: {
    githubId: number | null;
    fullName: string;
    installationId?: number | null;
    defaultBranch?: string;
  },
  db: Db = getDb(),
) {
  const [row] = await db
    .insert(repos)
    .values({
      githubId: input.githubId,
      fullName: input.fullName,
      installationId: input.installationId ?? null,
      defaultBranch: input.defaultBranch ?? "main",
      settings: DEFAULT_SETTINGS,
    })
    .onConflictDoUpdate({
      target: repos.fullName,
      set: {
        fullName: input.fullName,
        ...(input.installationId ? { installationId: input.installationId } : {}),
        ...(input.defaultBranch ? { defaultBranch: input.defaultBranch } : {}),
      },
    })
    .returning();
  return row!;
}

export async function findRepo(fullName: string, db: Db = getDb()) {
  return db.query.repos.findFirst({ where: eq(repos.fullName, fullName) });
}

/**
 * Inserts or refreshes a task and replaces its evidence set. Status only moves
 * forward from "ingesting"; a decided task stays decided when new commits arrive.
 */
export async function upsertTask(
  repoId: string,
  settings: RepoSettings,
  t: NormalizedTask,
  secretFindings: { kind: string; preview: string; ref: string }[],
  db: Db = getDb(),
): Promise<{
  id: string;
  created: boolean;
  headChanged: boolean;
  revertOf: string | null;
  /** The task's status before this ingest, or null when it is new. */
  previousStatus: TaskStatus | null;
}> {
  return db.transaction(async (tx) => {
    const existing = await tx.query.tasks.findFirst({ where: eq(tasks.externalId, t.externalId) });
    const headChanged = !!existing && existing.headSha !== t.headSha;
    // A revert points at the change it undoes by merge commit or PR number, in the same repo.
    let revertOf: string | null = null;
    if (t.reverts) {
      const match = or(
        t.reverts.prNumbers.length ? inArray(tasks.prNumber, t.reverts.prNumbers) : undefined,
        ...t.reverts.shas.map((sha) => like(tasks.mergeCommitSha, `${sha}%`)),
      );
      const target = await tx.query.tasks.findFirst({
        where: and(eq(tasks.repoId, repoId), ne(tasks.externalId, t.externalId), match),
      });
      revertOf = target?.id ?? null;
    }
    const values = {
      repoId,
      agent: t.agent,
      agentDetection: t.agentDetection,
      source: t.source,
      externalId: t.externalId,
      prNumber: t.prNumber,
      prUrl: t.prUrl,
      title: t.title,
      branch: t.branch,
      baseSha: t.baseSha,
      headSha: t.headSha,
      authorLogin: t.authorLogin,
      agentClaim: t.agentClaim,
      labels: t.labels,
      prState: t.state,
      additions: t.additions,
      deletions: t.deletions,
      files: t.files,
      secretFindings,
      occurredAt: new Date(t.occurredAt),
      mergedAt: t.mergedAt ? new Date(t.mergedAt) : null,
      mergeCommitSha: t.mergeCommitSha,
      revertOf,
      ...(!existing || headChanged ? { headChangedAt: new Date() } : {}),
    };

    let id: string;
    if (existing) {
      id = existing.id;
      await tx.update(tasks).set(values).where(eq(tasks.id, id));
    } else {
      const [row] = await tx
        .insert(tasks)
        .values({ ...values, status: "ingesting" })
        .returning({ id: tasks.id });
      id = row!.id;
    }

    const expiresAt = expiryDate(settings);
    // Evidence the agent reported through the SDK for this PR joins what GitHub has.
    const reported = await tx
      .select()
      .from(agentEvidence)
      .where(eq(agentEvidence.externalId, t.externalId));
    const all = [
      ...t.evidence,
      ...reported.map((r) => r.evidence).filter((e) => !t.evidence.some((x) => x.ref === e.ref)),
    ];
    const newRefs = all.map((e) => e.ref);
    // Screenshots come from the capture stage, not from GitHub; keep them across re-ingests.
    const fromSource = and(eq(evidence.taskId, id), ne(evidence.kind, "screenshot"));
    await tx
      .delete(evidence)
      .where(newRefs.length ? and(fromSource, notInArray(evidence.ref, newRefs)) : fromSource);
    for (const e of all) {
      await tx
        .insert(evidence)
        .values({
          taskId: id,
          ref: e.ref,
          kind: e.kind,
          title: e.title,
          payload: e.payload,
          blobPath: e.blobPath,
          expiresAt,
        })
        .onConflictDoUpdate({
          target: [evidence.taskId, evidence.ref],
          set: { kind: e.kind, title: e.title, payload: e.payload, expiresAt },
        });
    }
    return {
      id,
      created: !existing,
      headChanged,
      revertOf,
      previousStatus: existing?.status ?? null,
    };
  });
}

export async function setTaskStatus(
  taskId: string,
  status: TaskStatus,
  opts: { progress?: number; detail?: string | null } = {},
  db: Db = getDb(),
): Promise<void> {
  const progress = opts.progress ?? (status === "ready" || status === "decided" ? 1 : 0);
  await db
    .update(tasks)
    .set({ status, progress, statusDetail: opts.detail ?? null })
    .where(eq(tasks.id, taskId));
  await publish({ type: "task.updated", taskId, status, progress });
}

export async function upsertDeploy(
  input: {
    repoId: string;
    githubDeploymentId: number;
    environment: string;
    sha: string;
    previousSha: string | null;
    status: string;
    environmentUrl: string | null;
    deployedAt: Date;
    prNumbers: number[];
  },
  db: Db = getDb(),
) {
  const taskRows = input.prNumbers.length
    ? await db
        .select({ id: tasks.id })
        .from(tasks)
        .where(and(eq(tasks.repoId, input.repoId), inArray(tasks.prNumber, input.prNumbers)))
    : [];
  const values = {
    repoId: input.repoId,
    githubDeploymentId: input.githubDeploymentId,
    environment: input.environment,
    sha: input.sha,
    previousSha: input.previousSha,
    status: input.status,
    environmentUrl: input.environmentUrl,
    deployedAt: input.deployedAt,
    taskIds: taskRows.map((r) => r.id),
    prNumbers: input.prNumbers,
  };
  await db
    .insert(deploys)
    .values(values)
    .onConflictDoUpdate({
      target: deploys.githubDeploymentId,
      set: {
        status: values.status,
        previousSha: values.previousSha,
        taskIds: values.taskIds,
        prNumbers: values.prNumbers,
        environmentUrl: values.environmentUrl,
      },
    });
}
