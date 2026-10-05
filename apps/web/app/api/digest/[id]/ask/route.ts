import { answerDigestQuestion } from "@lumi/ai";
import type { Evidence } from "@lumi/core";
import { evidence as evidenceTable, getDb, questions } from "@lumi/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { digestQaBriefs } from "@/lib/digests";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const Body = z.object({
  question: z.string().trim().min(3).max(500),
  videoTimeMs: z.number().int().nonnegative().optional(),
  watching: z.string().max(600).optional(),
  /** The task whose item is playing; its full evidence is added to the digest's reviews. */
  taskId: z.string().uuid().optional(),
});

/** Answers a question across a digest's tasks from their reviews, with links to them. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: "Ask a question of at least a few words." }, { status: 400 });
  const briefs = await digestQaBriefs(id);
  if (!briefs) return Response.json({ error: "not found" }, { status: 404 });

  const focusId = briefs.some((b) => b.taskId === parsed.data.taskId)
    ? parsed.data.taskId
    : undefined;
  let focus: { taskId: string; evidence: Evidence[] } | undefined;
  if (focusId) {
    const rows = await getDb()
      .select()
      .from(evidenceTable)
      .where(eq(evidenceTable.taskId, focusId));
    focus = {
      taskId: focusId,
      evidence: rows.map((r) => ({
        ref: r.ref,
        kind: r.kind,
        title: r.title,
        payload: r.payload,
        blobPath: r.blobPath,
      })),
    };
  }

  const answer = await answerDigestQuestion({
    question: parsed.data.question,
    briefs,
    focus,
    context: parsed.data.watching,
  });
  // Evidence refs belong to the watched task; show them as that task's review.
  const sentences = answer.sentences.map(({ text, refs }) => ({
    text,
    refs: [
      ...new Set(refs.map((r) => (r.startsWith("review:") || !focusId ? r : `review:${focusId}`))),
    ],
  }));
  const [row] = await getDb()
    .insert(questions)
    .values({
      digestId: id,
      question: parsed.data.question,
      answer: sentences,
      notInEvidence: answer.notInEvidence,
      askedBy: user.login,
      videoTimeMs: parsed.data.videoTimeMs ?? null,
    })
    .returning({ id: questions.id, at: questions.createdAt });
  return Response.json({
    id: row!.id,
    question: parsed.data.question,
    answer: sentences,
    notInEvidence: answer.notInEvidence,
    by: user.login,
    at: row!.at,
  });
}
