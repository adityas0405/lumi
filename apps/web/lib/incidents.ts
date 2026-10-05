import { PERSONAS, parseRef } from "@lumi/core";
import {
  agents,
  decisions,
  deploys,
  evidence,
  getDb,
  incidents,
  scripts,
  tasks,
  triageResults,
} from "@lumi/db";
import { and, desc, eq } from "drizzle-orm";

export interface IncidentSummary {
  id: string;
  title: string;
  severity: string;
  status: string;
  source: string;
  service: string | null;
  startedAt: string;
  suspect: { prNumber: number | null; agentName: string } | null;
}

export async function listIncidents(): Promise<IncidentSummary[]> {
  const db = getDb();
  const rows = await db.select().from(incidents).orderBy(desc(incidents.startedAt)).limit(50);
  const out: IncidentSummary[] = [];
  for (const r of rows) {
    const s = r.suspects[0];
    const t = s ? await db.query.tasks.findFirst({ where: eq(tasks.id, s.taskId) }) : null;
    out.push({
      id: r.id,
      title: r.title,
      severity: r.severity,
      status: r.status,
      source: r.source,
      service: r.service,
      startedAt: r.startedAt.toISOString(),
      suspect: t ? { prNumber: t.prNumber, agentName: PERSONAS[t.agent].name } : null,
    });
  }
  return out;
}

export async function getIncident(id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const db = getDb();
  const inc = await db.query.incidents.findFirst({ where: eq(incidents.id, id) });
  if (!inc) return null;
  const deploy = inc.deployId
    ? await db.query.deploys.findFirst({ where: eq(deploys.id, inc.deployId) })
    : null;
  const suspects = [];
  for (const s of inc.suspects) {
    const t = await db.query.tasks.findFirst({ where: eq(tasks.id, s.taskId) });
    if (!t) continue;
    const [tri, dec, script, hunks, agent] = await Promise.all([
      db.query.triageResults.findFirst({
        where: eq(triageResults.taskId, t.id),
        orderBy: desc(triageResults.createdAt),
      }),
      db.query.decisions.findFirst({
        where: eq(decisions.taskId, t.id),
        orderBy: desc(decisions.createdAt),
      }),
      db.query.scripts.findFirst({
        where: and(eq(scripts.subjectId, t.id), eq(scripts.subjectType, "task")),
        orderBy: desc(scripts.version),
      }),
      db
        .select({ ref: evidence.ref })
        .from(evidence)
        .where(and(eq(evidence.taskId, t.id), eq(evidence.kind, "diff_hunk"))),
      db.query.agents.findFirst({ where: eq(agents.key, t.agent) }),
    ]);
    suspects.push({
      ...s,
      task: {
        id: t.id,
        title: t.title,
        prNumber: t.prNumber,
        prUrl: t.prUrl,
        agent: t.agent,
        agentName: PERSONAS[t.agent].name,
      },
      headline: (script?.body as { headline?: string } | undefined)?.headline ?? t.title,
      triage: tri ? { route: tri.route, summary: tri.summary } : null,
      approvedBy: dec?.kind === "approve" ? dec.decidedBy : null,
      agentPaused: Boolean(agent?.pausedAt),
      changes: hunks.flatMap((h) => {
        const p = parseRef(h.ref);
        return p?.type === "diff" ? [{ path: p.path, start: p.start, end: p.end }] : [];
      }),
    });
  }
  return {
    id: inc.id,
    title: inc.title,
    severity: inc.severity,
    status: inc.status,
    source: inc.source,
    service: inc.service,
    environment: inc.environment,
    startedAt: inc.startedAt.toISOString(),
    stats: inc.stats as {
      events: number | null;
      users: number | null;
      windowMinutes: number | null;
      baselineEvents: number | null;
      url: string | null;
      tags: Record<string, string>;
    },
    frames: inc.frames,
    deploy: deploy ? { sha: deploy.sha, deployedAt: deploy.deployedAt.toISOString() } : null,
    suspects,
    actions: inc.actions,
  };
}

export type IncidentDetail = NonNullable<Awaited<ReturnType<typeof getIncident>>>;
