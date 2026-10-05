import { PERSONAS, type Timeline, toWebVtt } from "@lumi/core";
import { getDb, renders } from "@lumi/db";
import { and, eq } from "drizzle-orm";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Captions for a render; `mode=plain` swaps in the plain-language wording on the same timings. */
export async function GET(req: Request, { params }: { params: Promise<{ id: string }> }) {
  if (!(await currentUser())) return new Response("unauthorized", { status: 401 });
  const { id } = await params;
  const url = new URL(req.url);
  const renderId = url.searchParams.get("render") ?? "";
  const plain = url.searchParams.get("mode") === "plain";
  const r = await getDb().query.renders.findFirst({
    where: and(eq(renders.id, renderId), eq(renders.subjectId, id)),
  });
  if (!r?.timeline) return new Response("not found", { status: 404 });
  const timeline = r.timeline as Timeline;
  const shown: Timeline = plain
    ? { ...timeline, sentences: timeline.sentences.map((s) => ({ ...s, technical: s.plain })) }
    : timeline;
  return new Response(
    toWebVtt(shown, (a) => PERSONAS[a].name),
    { headers: { "content-type": "text/vtt; charset=utf-8" } },
  );
}
