import { relative, sep } from "node:path";
import {
  type AgentKey,
  type Evidence,
  isTestFile,
  PERSONAS,
  type TaskScript,
  type Timeline,
} from "@lumi/core";
import {
  dataDir,
  decisions,
  evidence as evidenceTable,
  getDb,
  outcomes,
  questions,
  type RepoSettings,
  renders,
  repos,
  scripts,
  tasks,
  triageResults,
} from "@lumi/db";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import { URGENCY } from "./state";

export type Health = "problem" | "decision" | "healthy" | "working";

export interface TaskCard {
  id: string;
  prNumber: number | null;
  prUrl: string | null;
  title: string;
  agent: AgentKey;
  agentName: string;
  repo: string;
  area: string;
  status: string;
  statusDetail: string | null;
  progress: number;
  prState: string;
  occurredAt: Date;
  route: "auto_pass" | "needs_human" | "block" | null;
  score: number;
  headline: string | null;
  summary: string | null;
  durationMs: number | null;
  decision: { kind: string; by: string; at: Date } | null;
  outcomes: string[];
  /** Which side an open change has stalled on, from the held-up sweep. */
  heldUp: "reviewer" | "agent" | null;
  heldUpDays: number;
  /** Set when this task is a rollback: the change it reverts. */
  revertOf: { id: string; prNumber: number | null } | null;
  health: Health;
  healthReason: string;
  /** One scannable word for the state, e.g. "Blocked". */
  word: string;
  /** Medium and high findings from triage, with the evidence refs they cite. */
  defects: { severity: string; summary: string; explanation: string; refs: string[] }[];
  /** Lumi's recommendation from the review script. */
  recommendation: { kind: string; reason: string } | null;
  /** The latest thing that happened: opened, merged, decided, or an outcome. */
  activityAt: Date;
}

function areaOf(
  files: { path: string; additions: number; deletions: number }[],
  settings: RepoSettings,
): string {
  const weight = new Map<string, number>();
  // A change's area is where its code is; tests only decide it when nothing else changed.
  const code = files.filter((f) => !isTestFile(f.path));
  for (const f of code.length ? code : files) {
    const prefix = Object.keys(settings.areas).find((p) => f.path.startsWith(p));
    const area = prefix
      ? settings.areas[prefix]!
      : f.path.includes("/")
        ? f.path.split("/").slice(0, 2).join("/")
        : "Repository";
    weight.set(area, (weight.get(area) ?? 0) + f.additions + f.deletions + 1);
  }
  return [...weight].sort((a, b) => b[1] - a[1])[0]?.[0] ?? "Repository";
}

/**
 * A task's state for the inbox: a short word you can scan ("Blocked"), the reason in
 * full ("Blocked by triage"), and the tone that colours it. Problems first, then what
 * waits on you, then what waits on the agent, then finished work.
 */
function healthOf(c: Omit<TaskCard, "health" | "healthReason" | "word">): {
  health: Health;
  reason: string;
  word: string;
} {
  const s = (health: Health, word: string, reason: string) => ({ health, word, reason });
  if (c.revertOf) {
    const of = c.revertOf.prNumber ? `#${c.revertOf.prNumber}` : "a change";
    return c.prState === "merged"
      ? s("healthy", "Rolled back", `Rolled back ${of}`)
      : s("decision", "Merge rollback", `Rollback of ${of}: merge to finish`);
  }
  if (c.status === "failed") return s("problem", "Failed", "Review pipeline failed");
  if (c.outcomes.includes("incident_linked"))
    return s("problem", "Incident", "Linked to a production incident");
  if (c.outcomes.includes("reverted")) return s("problem", "Reverted", "Reverted");
  if (c.decision?.kind === "reject") return s("problem", "Rejected", "Rejected");
  if (c.prState !== "open" && c.route === "block" && c.decision?.kind === "approve")
    return s("problem", "Shipped over block", "Merged although Lumi blocked it");
  if (c.prState === "open" && c.route === "block" && !c.decision)
    return s("problem", "Blocked", "Blocked by triage");
  if (c.prState === "open" && c.decision?.kind === "request_changes")
    return c.heldUp === "agent"
      ? s("problem", "Stalled", `Agent hasn't responded in ${c.heldUpDays} days`)
      : s("working", "With agent", "Changes requested; waiting on the agent");
  if (!["ready", "decided"].includes(c.status))
    return s("working", "In review", c.statusDetail ?? "Lumi is reviewing it");
  if (c.prState === "open" && !c.decision)
    return c.heldUp === "reviewer"
      ? s("decision", "Needs you", `Waiting on you for ${c.heldUpDays} days`)
      : s("decision", "Needs you", "Needs your decision");
  return c.prState === "merged"
    ? s("healthy", "Merged", "Merged")
    : s("healthy", "Reviewed", "Reviewed");
}

/** Every task with what the map and inbox need, newest first. */
export async function listTaskCards(): Promise<TaskCard[]> {
  const db = getDb();
  const rows = await db
    .select({ task: tasks, repo: repos })
    .from(tasks)
    .innerJoin(repos, eq(repos.id, tasks.repoId))
    .orderBy(desc(tasks.occurredAt));
  const ids = rows.map((r) => r.task.id);
  if (ids.length === 0) return [];
  const [tri, rend, dec, outc, scr] = await Promise.all([
    db
      .select()
      .from(triageResults)
      .where(inArray(triageResults.taskId, ids))
      .orderBy(desc(triageResults.createdAt)),
    db
      .select()
      .from(renders)
      .where(and(inArray(renders.subjectId, ids), eq(renders.status, "ready")))
      .orderBy(desc(renders.createdAt)),
    db
      .select()
      .from(decisions)
      .where(inArray(decisions.taskId, ids))
      .orderBy(desc(decisions.createdAt)),
    db.select().from(outcomes).where(inArray(outcomes.taskId, ids)),
    db
      .select({ subjectId: scripts.subjectId, body: scripts.body, version: scripts.version })
      .from(scripts)
      .where(inArray(scripts.subjectId, ids))
      .orderBy(desc(scripts.version)),
  ]);
  const first = <T, K>(list: T[], key: (t: T) => K) => {
    const m = new Map<K, T>();
    for (const x of list) if (!m.has(key(x))) m.set(key(x), x);
    return m;
  };
  const triBy = first(tri, (t) => t.taskId);
  const rendBy = first(rend, (r) => r.subjectId);
  const decBy = first(dec, (d) => d.taskId);
  const scrBy = first(scr, (s) => s.subjectId);
  const byId = new Map(rows.map((r) => [r.task.id, r.task]));

  return rows.map(({ task, repo }) => {
    const t = triBy.get(task.id);
    const d = decBy.get(task.id);
    const script = scrBy.get(task.id)?.body as TaskScript | undefined;
    const base = {
      id: task.id,
      prNumber: task.prNumber,
      prUrl: task.prUrl,
      title: task.title,
      agent: task.agent,
      agentName: PERSONAS[task.agent].name,
      repo: repo.fullName,
      area: areaOf(task.files, repo.settings),
      status: task.status,
      statusDetail: task.statusDetail,
      progress: task.progress,
      prState: task.prState,
      occurredAt: task.occurredAt,
      route: t?.route ?? null,
      score: t?.score ?? 0,
      headline: script?.headline ?? null,
      summary: t?.summary ?? null,
      durationMs: rendBy.get(task.id)?.durationMs ?? null,
      decision: d ? { kind: d.kind, by: d.decidedBy, at: d.createdAt } : null,
      outcomes: outc.filter((o) => o.taskId === task.id).map((o) => o.kind),
      defects: (t?.suspectedDefects ?? [])
        .filter((x) => x.severity !== "low")
        .map((x) => ({
          severity: x.severity,
          summary: x.summary,
          explanation: x.explanation,
          refs: x.refs,
        })),
      recommendation: script?.decision
        ? { kind: script.decision.recommendation, reason: script.decision.reason }
        : null,
      activityAt: new Date(
        Math.max(
          task.occurredAt.getTime(),
          task.mergedAt?.getTime() ?? 0,
          d?.createdAt.getTime() ?? 0,
          ...outc.filter((o) => o.taskId === task.id).map((o) => o.occurredAt.getTime()),
        ),
      ),
      heldUp: (() => {
        const refs = outc
          .filter((o) => o.taskId === task.id && o.kind === "held_up")
          .map((o) => o.ref);
        if (task.prState !== "open") return null;
        if (!d && refs.includes("reviewer")) return "reviewer" as const;
        if (d?.kind === "request_changes" && refs.includes("agent")) return "agent" as const;
        return null;
      })(),
      heldUpDays: repo.settings?.heldUpDays ?? 3,
      revertOf: task.revertOf
        ? { id: task.revertOf, prNumber: byId.get(task.revertOf)?.prNumber ?? null }
        : null,
    };
    const { health, reason, word } = healthOf(base);
    return { ...base, health, healthReason: reason, word };
  });
}

export interface TaskDetail {
  card: TaskCard;
  /** Where this task sits among the ones that need you, in inbox order, for n / p. */
  queue: { prev: string | null; next: string | null; position: number | null; total: number };
  agentColor: string;
  script: TaskScript | null;
  timeline: Timeline | null;
  render: {
    id: string;
    videoUrl: string;
    posterUrl: string | null;
    captionsUrl: string;
    durationMs: number;
  } | null;
  renderInProgress: { status: string; progress: number } | null;
  evidence: Evidence[];
  triage: {
    route: string;
    summary: string;
    reasons: { text: string; refs: string[] }[];
    defects: { summary: string; explanation: string; refs: string[]; severity: string }[];
    signals: { rule: string; severity: string; message: string; refs: string[] }[];
    model: string;
  } | null;
  decisions: {
    kind: string;
    feedback: string | null;
    by: string;
    at: Date;
    deliveredAt: Date | null;
    deliveryError: string | null;
    reviewId: string | null;
  }[];
  questions: {
    id: string;
    question: string;
    answer: { text: string; refs: string[] }[] | null;
    notInEvidence: boolean;
    by: string;
    at: Date;
  }[];
  plantedError: string | null;
  /** What happened after review, oldest first. */
  outcomes: { kind: string; ref: string | null; detail: string | null; at: Date }[];
  /** The change this rollback undoes, and the rollback that undid this change. */
  revertOf: LinkedTask | null;
  revertedBy: LinkedTask | null;
}

export interface LinkedTask {
  id: string;
  prNumber: number | null;
  prUrl: string | null;
  title: string;
}

const linked = (t: typeof tasks.$inferSelect | undefined): LinkedTask | null =>
  t ? { id: t.id, prNumber: t.prNumber, prUrl: t.prUrl, title: t.title } : null;

export async function getTaskDetail(id: string): Promise<TaskDetail | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const cards = await listTaskCards();
  const card = cards.find((c) => c.id === id);
  if (!card) return null;
  const needsYou = cards
    .filter((c) => c.health === "problem" || c.health === "decision")
    .sort(
      (a, b) =>
        URGENCY[a.health] - URGENCY[b.health] || b.activityAt.getTime() - a.activityAt.getTime(),
    );
  const at = needsYou.findIndex((c) => c.id === id);
  const queue = {
    prev: at > 0 ? needsYou[at - 1]!.id : null,
    next: at >= 0 ? (needsYou[at + 1]?.id ?? null) : (needsYou[0]?.id ?? null),
    position: at >= 0 ? at + 1 : null,
    total: needsYou.length,
  };
  const db = getDb();
  const [task, ev, scriptRow, renderRows, tri, decs, qs, outc, reverter] = await Promise.all([
    db.query.tasks.findFirst({ where: eq(tasks.id, id) }),
    db
      .select()
      .from(evidenceTable)
      .where(eq(evidenceTable.taskId, id))
      .orderBy(asc(evidenceTable.createdAt)),
    db.query.scripts.findFirst({
      where: eq(scripts.subjectId, id),
      orderBy: desc(scripts.version),
    }),
    db.select().from(renders).where(eq(renders.subjectId, id)).orderBy(desc(renders.createdAt)),
    db.query.triageResults.findFirst({
      where: eq(triageResults.taskId, id),
      orderBy: desc(triageResults.createdAt),
    }),
    db.select().from(decisions).where(eq(decisions.taskId, id)).orderBy(desc(decisions.createdAt)),
    db.select().from(questions).where(eq(questions.taskId, id)).orderBy(asc(questions.createdAt)),
    db.select().from(outcomes).where(eq(outcomes.taskId, id)).orderBy(asc(outcomes.occurredAt)),
    db.query.tasks.findFirst({ where: eq(tasks.revertOf, id) }),
  ]);
  const reverted = task?.revertOf
    ? await db.query.tasks.findFirst({ where: eq(tasks.id, task.revertOf) })
    : undefined;
  const ready = renderRows.find((r) => r.status === "ready" && r.videoPath);
  const latest = renderRows[0];
  const media = (p: string) =>
    `/api/media/${relative(dataDir(), p).split(sep).map(encodeURIComponent).join("/")}`;
  return {
    card,
    queue,
    agentColor: `var(--${{ "claude-code": "clay", cursor: "slate", devin: "sage", unknown: "dust" }[card.agent]})`,
    script: (scriptRow?.body as TaskScript) ?? null,
    timeline: (ready?.timeline as Timeline) ?? null,
    render: ready
      ? {
          id: ready.id,
          videoUrl: media(ready.videoPath!),
          posterUrl: ready.posterPath ? media(ready.posterPath) : null,
          captionsUrl: `/api/tasks/${id}/captions?render=${ready.id}`,
          durationMs: ready.durationMs ?? 0,
        }
      : null,
    renderInProgress:
      latest && latest.status !== "ready" && latest.status !== "failed"
        ? { status: latest.status, progress: latest.progress }
        : null,
    evidence: ev.map((e) => ({
      ref: e.ref,
      kind: e.kind,
      title: e.title,
      payload: e.payload,
      blobPath: e.blobPath,
    })),
    triage: tri
      ? {
          route: tri.route,
          summary: tri.summary,
          reasons: tri.reasons,
          defects: tri.suspectedDefects,
          signals: tri.signals,
          model: tri.model,
        }
      : null,
    decisions: decs.map((d) => ({
      kind: d.kind,
      feedback: d.feedback,
      by: d.decidedBy,
      at: d.createdAt,
      deliveredAt: d.deliveredAt,
      deliveryError: d.deliveryError,
      reviewId: d.githubReviewId,
    })),
    questions: qs.map((q) => ({
      id: q.id,
      question: q.question,
      answer: q.answer,
      notInEvidence: q.notInEvidence,
      by: q.askedBy,
      at: q.createdAt,
    })),
    plantedError: task?.plantedError ?? null,
    outcomes: outc.map((o) => ({ kind: o.kind, ref: o.ref, detail: o.detail, at: o.occurredAt })),
    revertOf: linked(reverted),
    revertedBy: linked(reverter),
  };
}
