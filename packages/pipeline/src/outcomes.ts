import { heldUpSide } from "@lumi/core";
import { decisions, getDb, type OutcomeKind, outcomes, renders, repos, tasks } from "@lumi/db";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { publish } from "./events";
import { log } from "./log";
import { DEFAULT_SETTINGS } from "./store";

/**
 * Records what happened to a change after review. Idempotent: the same (task, kind,
 * ref) is stored once, so re-ingesting a pull request never duplicates its history.
 * Returns whether the row was new.
 */
export async function recordOutcome(o: {
  taskId: string;
  kind: OutcomeKind;
  ref?: string | null;
  detail?: string | null;
  occurredAt: Date;
}): Promise<boolean> {
  const rows = await getDb()
    .insert(outcomes)
    .values({
      taskId: o.taskId,
      kind: o.kind,
      ref: o.ref ?? null,
      detail: o.detail ?? null,
      occurredAt: o.occurredAt,
    })
    .onConflictDoNothing()
    .returning({ id: outcomes.id });
  if (rows.length) {
    const task = await getDb().query.tasks.findFirst({ where: eq(tasks.id, o.taskId) });
    if (task)
      await publish({
        type: "task.updated",
        taskId: task.id,
        status: task.status,
        progress: task.progress,
      });
  }
  return rows.length > 0;
}

/**
 * Outcomes that follow from a pull request's own state: it merged, and if it is a
 * revert that merged, the change it undoes was reverted. Returns the reverted task.
 */
export async function recordPullRequestOutcomes(
  taskId: string,
): Promise<{ reverted: string | null }> {
  const task = await getDb().query.tasks.findFirst({ where: eq(tasks.id, taskId) });
  if (task?.prState !== "merged" || !task.mergedAt) return { reverted: null };
  await recordOutcome({
    taskId,
    kind: "merged",
    ref: task.mergeCommitSha,
    occurredAt: task.mergedAt,
  });
  if (!task.revertOf) return { reverted: null };
  const isNew = await recordOutcome({
    taskId: task.revertOf,
    kind: "reverted",
    ref: task.prUrl,
    detail: task.prNumber ? `Reverted by #${task.prNumber}` : "Reverted",
    occurredAt: task.mergedAt,
  });
  if (isNew) log.warn({ taskId: task.revertOf, by: task.prNumber }, "change reverted");
  return { reverted: isNew ? task.revertOf : null };
}

/**
 * Marks open changes that have stalled: waiting on the reviewer's decision, or on
 * the agent after changes were requested, for longer than the repo allows.
 */
export async function sweepHeldUp(now = new Date()): Promise<number> {
  const db = getDb();
  const open = await db
    .select({ task: tasks, settings: repos.settings })
    .from(tasks)
    .innerJoin(repos, eq(repos.id, tasks.repoId))
    .where(and(eq(tasks.prState, "open"), inArray(tasks.status, ["ready", "decided"])));
  const candidates = open.filter((r) => !r.task.revertOf);
  if (!candidates.length) return 0;
  const ids = candidates.map((r) => r.task.id);
  const [dec, rend] = await Promise.all([
    db
      .select()
      .from(decisions)
      .where(inArray(decisions.taskId, ids))
      .orderBy(desc(decisions.createdAt)),
    db
      .select({ subjectId: renders.subjectId, createdAt: renders.createdAt })
      .from(renders)
      .where(and(inArray(renders.subjectId, ids), eq(renders.status, "ready")))
      .orderBy(asc(renders.createdAt)),
  ]);
  let recorded = 0;
  for (const { task, settings } of candidates) {
    const days = settings?.heldUpDays ?? DEFAULT_SETTINGS.heldUpDays ?? 3;
    const d = dec.find((x) => x.taskId === task.id);
    const side = heldUpSide({
      now,
      days,
      readySince: rend.find((r) => r.subjectId === task.id)?.createdAt ?? task.createdAt,
      latestDecision: d ? { kind: d.kind, at: d.createdAt } : null,
      headChangedAt: task.headChangedAt,
    });
    if (!side) continue;
    const isNew = await recordOutcome({
      taskId: task.id,
      kind: "held_up",
      ref: side,
      detail:
        side === "reviewer"
          ? `Waiting on the reviewer for ${days} days`
          : `No new commits from the agent ${days} days after changes were requested`,
      occurredAt: now,
    });
    if (isNew) recorded++;
  }
  if (recorded) log.info({ recorded }, "held-up work recorded");
  return recorded;
}
