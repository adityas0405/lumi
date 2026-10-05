import { answerQuestion } from "@lumi/ai";
import type { Evidence } from "@lumi/core";
import { evidence as evidenceTable, getDb, questions, tasks } from "@lumi/db";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const Body = z.object({
  question: z.string().trim().min(3).max(500),
  videoTimeMs: z.number().int().nonnegative().optional(),
  watching: z.string().max(600).optional(),
});

/** Answers a reviewer's question from this task's evidence only, with citations. */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return Response.json({ error: "Ask a question of at least a few words." }, { status: 400 });
  const db = getDb();
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, id) });
  if (!task) return Response.json({ error: "not found" }, { status: 404 });
  const rows = await db.select().from(evidenceTable).where(eq(evidenceTable.taskId, id));
  const evidence: Evidence[] = rows.map((r) => ({
    ref: r.ref,
    kind: r.kind,
    title: r.title,
    payload: r.payload,
    blobPath: r.blobPath,
  }));

  const answer = await answerQuestion({
    title: task.title,
    question: parsed.data.question,
    evidence,
    context: parsed.data.watching,
  });
  const sentences = answer.sentences.map(({ text, refs }) => ({ text, refs }));
  const [row] = await db
    .insert(questions)
    .values({
      taskId: id,
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
