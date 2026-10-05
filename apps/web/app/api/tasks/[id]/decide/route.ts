import { PERSONAS } from "@lumi/core";
import { decisions, getDb, repos, tasks } from "@lumi/db";
import { postReview, repoOctokit, reviewBody } from "@lumi/github";
import { log, setTaskStatus } from "@lumi/pipeline";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

const Body = z
  .object({
    kind: z.enum(["approve", "request_changes", "reject"]),
    feedback: z.string().trim().max(5000).optional(),
  })
  .refine((b) => b.kind === "approve" || (b.feedback?.length ?? 0) >= 3, {
    message: "Say what should change, so the agent knows what to do.",
  });

/**
 * Records a decision and delivers it to the agent's workflow as a GitHub review.
 * The decision is kept even if delivery fails, with the error, so it can be retried.
 */
export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const parsed = Body.safeParse(await req.json().catch(() => null));
  if (!parsed.success)
    return Response.json(
      { error: parsed.error.issues[0]?.message ?? "Invalid decision" },
      { status: 400 },
    );
  const { kind, feedback } = parsed.data;

  const db = getDb();
  const task = await db.query.tasks.findFirst({ where: eq(tasks.id, id) });
  if (!task) return Response.json({ error: "not found" }, { status: 404 });
  const repo = await db.query.repos.findFirst({ where: eq(repos.id, task.repoId) });

  let reviewId: string | null = null;
  let reviewUrl: string | null = null;
  let deliveryError: string | null = null;
  const started = Date.now();
  if (task.prNumber && repo?.installationId) {
    try {
      const { octokit } = await repoOctokit(repo.fullName, repo.installationId);
      const base = process.env.LUMI_PUBLIC_URL?.replace(/\/$/, "");
      const body = reviewBody({
        kind,
        decidedBy: user.login,
        feedback: feedback ?? null,
        mention: repo.settings.mentionPrefixes[task.agent] ?? PERSONAS[task.agent].mentionPrefix,
        lumiUrl: base && !base.includes("localhost") ? `${base}/tasks/${id}` : null,
      });
      const r = await postReview(octokit, repo.fullName, task.prNumber, kind, body, {
        closeOnReject: repo.settings.closeOnReject,
      });
      reviewId = String(r.reviewId);
      reviewUrl = r.url;
    } catch (err) {
      deliveryError = err instanceof Error ? err.message : String(err);
      log.warn({ taskId: id, err: deliveryError }, "decision delivery failed");
    }
  }
  const [row] = await db
    .insert(decisions)
    .values({
      taskId: id,
      kind,
      feedback: feedback ?? null,
      decidedBy: user.login,
      githubReviewId: reviewId,
      deliveredAt: reviewId ? new Date() : null,
      deliveryError,
    })
    .returning();
  await setTaskStatus(id, "decided", { progress: 1, detail: null });
  log.info(
    {
      taskId: id,
      kind,
      by: user.login,
      deliveredMs: Date.now() - started,
      delivered: Boolean(reviewId),
    },
    "decision recorded",
  );
  return Response.json({
    id: row!.id,
    kind,
    reviewUrl,
    deliveryError,
    deliveredMs: Date.now() - started,
  });
}
