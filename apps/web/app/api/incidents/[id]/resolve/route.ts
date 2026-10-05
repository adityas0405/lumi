import { resolveIncident } from "@lumi/pipeline";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  await resolveIncident(id, user.login);
  return Response.json({ ok: true });
}
