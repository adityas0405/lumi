import { enqueue } from "@lumi/pipeline";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/** Builds a fresh digest now (the scheduled one runs every morning). */
export async function POST() {
  if (!(await currentUser())) return Response.json({ error: "unauthorized" }, { status: 401 });
  await enqueue("digest.build", {}, { singletonKey: "digest:manual", singletonSeconds: 60 });
  return Response.json({ queued: true });
}
