import { relative, sep } from "node:path";
import type { DigestQaBrief } from "@lumi/ai";
import type { DigestScript, TaskScript, Timeline } from "@lumi/core";
import { PERSONAS } from "@lumi/core";
import {
  dataDir,
  decisions,
  digests,
  getDb,
  questions,
  renders,
  repos,
  scripts,
  tasks,
  triageResults,
} from "@lumi/db";
import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { QA } from "@/components/review/AskPanel";

/** A task in the digest, routine included, with the request it answers. */
export interface DigestTask {
  taskId: string;
  section: string;
  agent: string;
  prNumber: number | null;
  title: string;
  request: { ref: string; number: number; title: string; requestedBy: string | null } | null;
}

interface DigestBody {
  script: DigestScript;
  dateLabel: string;
  tasks?: DigestTask[];
}

export interface DigestView {
  id: string;
  repo: string;
  dateLabel: string;
  createdAt: string;
  counts: { decisions: number; problems: number; done: number };
  video: { url: string; poster: string | null; captionsUrl: string; durationMs: number } | null;
  status: string;
  timeline: Timeline | null;
  items: {
    taskId: string;
    section: string;
    agentName: string;
    agent: string;
    prNumber: number | null;
    headline: string;
    why: { technical: string; plain: string } | null;
    technical: string[];
    plain: string[];
  }[];
  routineLine: { technical: string; plain: string };
  /** Every task the digest covers; empty for digests built before requests were recorded. */
  tasks: (DigestTask & { agentName: string })[];
  questions: QA[];
}

const media = (p: string) =>
  `/api/media/${relative(dataDir(), p).split(sep).map(encodeURIComponent).join("/")}`;

export async function latestDigestId(): Promise<string | null> {
  const d = await getDb().query.digests.findFirst({ orderBy: desc(digests.createdAt) });
  return d?.id ?? null;
}

export async function getDigest(id: string): Promise<DigestView | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const db = getDb();
  const d = await db.query.digests.findFirst({ where: eq(digests.id, id) });
  if (!d) return null;
  const [repo, script, render, qs] = await Promise.all([
    db.query.repos.findFirst({ where: eq(repos.id, d.repoId) }),
    db.query.scripts.findFirst({
      where: and(eq(scripts.subjectId, id), eq(scripts.subjectType, "digest")),
    }),
    db.query.renders.findFirst({
      where: eq(renders.subjectId, id),
      orderBy: desc(renders.createdAt),
    }),
    db.select().from(questions).where(eq(questions.digestId, id)).orderBy(asc(questions.createdAt)),
  ]);
  const body = script?.body as DigestBody | undefined;
  const ids = body?.script.sections.flatMap((s) => s.items.map((i) => i.taskId)) ?? [];
  const taskRows = ids.length ? await db.select().from(tasks).where(inArray(tasks.id, ids)) : [];
  const byId = new Map(taskRows.map((t) => [t.id, t]));
  const headlines = ids.length
    ? await db
        .select({ subjectId: scripts.subjectId, body: scripts.body })
        .from(scripts)
        .where(and(inArray(scripts.subjectId, ids), eq(scripts.subjectType, "task")))
        .orderBy(desc(scripts.version))
    : [];
  const headlineOf = (taskId: string) =>
    (headlines.find((h) => h.subjectId === taskId)?.body as { headline?: string } | undefined)
      ?.headline;
  return {
    id,
    repo: repo?.fullName ?? "",
    dateLabel: body?.dateLabel ?? d.day,
    createdAt: d.createdAt.toISOString(),
    counts: d.counts,
    status: render?.status ?? "queued",
    video:
      render?.status === "ready" && render.videoPath
        ? {
            url: media(render.videoPath),
            poster: render.posterPath ? media(render.posterPath) : null,
            captionsUrl: "",
            durationMs: render.durationMs ?? 0,
          }
        : null,
    timeline: (render?.timeline as Timeline) ?? null,
    items: (body?.script.sections ?? []).flatMap((s) =>
      s.items.map((i) => {
        const t = byId.get(i.taskId);
        return {
          taskId: i.taskId,
          section: s.kind,
          agent: t?.agent ?? "unknown",
          agentName: PERSONAS[t?.agent ?? "unknown"].name,
          prNumber: t?.prNumber ?? null,
          headline: headlineOf(i.taskId) ?? t?.title ?? "",
          why: i.why?.technical.trim() ? i.why : null,
          technical: i.technical,
          plain: i.plain,
        };
      }),
    ),
    routineLine: body?.script.routineLine ?? { technical: "", plain: "" },
    tasks: (body?.tasks ?? []).map((t) => ({
      ...t,
      agentName: PERSONAS[t.agent as keyof typeof PERSONAS]?.name ?? t.agent,
    })),
    questions: qs.map((q) => ({
      id: q.id,
      question: q.question,
      answer: q.answer,
      notInEvidence: q.notInEvidence,
      by: q.askedBy,
    })),
  };
}

/**
 * What the digest Ask reads: each task's finished review (headline, summary, findings,
 * recommendation and decision), the same material the digest itself was written from.
 */
export async function digestQaBriefs(id: string): Promise<DigestQaBrief[] | null> {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const db = getDb();
  const script = await db.query.scripts.findFirst({
    where: and(eq(scripts.subjectId, id), eq(scripts.subjectType, "digest")),
  });
  const body = script?.body as DigestBody | undefined;
  if (!body) return null;
  const list: DigestTask[] =
    body.tasks ??
    body.script.sections.flatMap((s) =>
      s.items.map((i) => ({
        taskId: i.taskId,
        section: s.kind,
        agent: "unknown",
        prNumber: null,
        title: "",
        request: null,
      })),
    );
  const ids = list.map((t) => t.taskId);
  if (!ids.length) return [];
  const [taskRows, scr, tri, dec] = await Promise.all([
    db.select().from(tasks).where(inArray(tasks.id, ids)),
    db
      .select({ subjectId: scripts.subjectId, body: scripts.body })
      .from(scripts)
      .where(and(inArray(scripts.subjectId, ids), eq(scripts.subjectType, "task")))
      .orderBy(desc(scripts.version)),
    db
      .select()
      .from(triageResults)
      .where(inArray(triageResults.taskId, ids))
      .orderBy(desc(triageResults.createdAt)),
    db
      .select()
      .from(decisions)
      .where(inArray(decisions.taskId, ids))
      .orderBy(desc(decisions.createdAt)),
  ]);
  const byTask = new Map(taskRows.map((t) => [t.id, t]));
  return list.flatMap((entry) => {
    const t = byTask.get(entry.taskId);
    if (!t) return [];
    const review = scr.find((x) => x.subjectId === t.id)?.body as TaskScript | undefined;
    const triage = tri.find((x) => x.taskId === t.id);
    const d = dec.find((x) => x.taskId === t.id);
    return [
      {
        taskId: t.id,
        section: entry.section,
        agent: PERSONAS[t.agent].name,
        prNumber: t.prNumber,
        title: t.title,
        headline: review?.headline ?? t.title,
        summary: review?.summary.technical ?? "",
        defects: (triage?.suspectedDefects ?? [])
          .filter((x) => x.severity !== "low")
          .map((x) => x.summary),
        recommendation: review?.decision.recommendation ?? "needs_discussion",
        decidedAs: d ? `${d.kind.replace("_", " ")} by @${d.decidedBy}` : null,
        request: entry.request,
      },
    ];
  });
}
