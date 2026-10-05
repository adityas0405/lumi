import { type Evidence, resolveRef } from "@lumi/core";
import { evidence as evidenceTable, getDb } from "@lumi/db";
import { inArray } from "drizzle-orm";
import { Header } from "@/components/Header";
import { Inbox, type InboxRow } from "@/components/Inbox";
import { LiveRefresh } from "@/components/LiveRefresh";
import { listTaskCards } from "@/lib/data";
import { shortTime } from "@/lib/format";
import { requireUser } from "@/lib/session";
import { touchVisit } from "@/lib/visits";

export const dynamic = "force-dynamic";

/** The inbox: what needs you since your last visit, most urgent first. */
export default async function Home() {
  const user = await requireUser();
  const now = process.env.LUMI_DEMO_NOW ? new Date(process.env.LUMI_DEMO_NOW) : new Date();
  const [cards, visit] = await Promise.all([listTaskCards(), touchVisit(user.login, now)]);

  // The code each finding cites, so the preview can show it without another request.
  const withDefects = cards.filter((c) => c.defects.length);
  const rows = withDefects.length
    ? await getDb()
        .select()
        .from(evidenceTable)
        .where(
          inArray(
            evidenceTable.taskId,
            withDefects.map((c) => c.id),
          ),
        )
    : [];
  const evidenceFor = (taskId: string, refs: string[]): Evidence[] => {
    const own: Evidence[] = rows
      .filter((r) => r.taskId === taskId)
      .map((r) => ({
        ref: r.ref,
        kind: r.kind,
        title: r.title,
        payload: r.payload,
        blobPath: r.blobPath,
      }));
    const found = refs.map((ref) => resolveRef(ref, own)).filter((e): e is Evidence => !!e);
    return [...new Map(found.map((e) => [e.ref, e])).values()];
  };

  const inbox: InboxRow[] = cards.map((c) => ({
    id: c.id,
    prNumber: c.prNumber,
    prUrl: c.prUrl,
    title: c.title,
    headline: c.headline ?? c.title,
    agent: c.agent,
    agentName: c.agentName,
    repo: c.repo,
    area: c.area,
    health: c.health,
    word: c.word,
    reason: c.healthReason,
    prState: c.prState,
    durationMs: c.durationMs,
    activityAt: c.activityAt.toISOString(),
    decided: c.decision ? { kind: c.decision.kind, by: c.decision.by } : null,
    recommendation: c.recommendation,
    defects: c.defects.slice(0, 2),
    evidence: evidenceFor(
      c.id,
      c.defects.slice(0, 2).flatMap((d) => d.refs),
    ),
  }));

  return (
    <>
      <Header user={user} active="review" />
      <LiveRefresh />
      <Inbox
        rows={inbox}
        now={now.toISOString()}
        since={visit.since.toISOString()}
        sinceLabel={
          visit.firstVisit
            ? "In the last 7 days"
            : `Since your last visit, ${shortTime(visit.since)}`
        }
      />
    </>
  );
}
