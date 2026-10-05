import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Header } from "@/components/Header";
import { LiveRefresh } from "@/components/LiveRefresh";
import { TaskReview } from "@/components/review/TaskReview";
import { getTaskDetail } from "@/lib/data";
import { AGENT_VAR } from "@/lib/format";
import { requireUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>;
}): Promise<Metadata> {
  const { id } = await params;
  const d = await getTaskDetail(id);
  return { title: d ? (d.card.prNumber ? `PR #${d.card.prNumber}` : d.card.title) : "Task" };
}

export default async function TaskPage({ params }: { params: Promise<{ id: string }> }) {
  const user = await requireUser();
  const { id } = await params;
  const d = await getTaskDetail(id);
  if (!d) notFound();
  return (
    <>
      <Header user={user} active="review" />
      <LiveRefresh taskId={id} />
      <TaskReview
        data={{
          taskId: id,
          title: d.card.title,
          agentName: d.card.agentName,
          agentColor: AGENT_VAR[d.card.agent] ?? "var(--dust)",
          prNumber: d.card.prNumber,
          prUrl: d.card.prUrl,
          prState: d.card.prState,
          repo: d.card.repo,
          route: d.card.route,
          script: d.script,
          timeline: d.timeline,
          render: d.render,
          renderInProgress: d.renderInProgress,
          statusDetail: d.card.statusDetail,
          evidence: d.evidence,
          triage: d.triage,
          now: new Date().toISOString(),
          word: d.card.word,
          health: d.card.health,
          reason: d.card.healthReason,
          area: d.card.area,
          queue: d.queue,
          outcomes: d.outcomes.map((o) => ({ ...o, at: o.at.toISOString() })),
          revertOf: d.revertOf,
          revertedBy: d.revertedBy,
          decisions: d.decisions.map((x) => ({
            kind: x.kind,
            feedback: x.feedback,
            by: x.by,
            at: x.at.toISOString(),
            deliveredAt: x.deliveredAt?.toISOString() ?? null,
            deliveryError: x.deliveryError,
          })),
          questions: d.questions.map((q) => ({
            id: q.id,
            question: q.question,
            answer: q.answer,
            notInEvidence: q.notInEvidence,
            by: q.by,
          })),
        }}
      />
    </>
  );
}
