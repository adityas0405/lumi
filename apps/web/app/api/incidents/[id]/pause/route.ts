import { AgentKey } from "@lumi/core";
import { pauseAgent } from "@lumi/pipeline";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

export async function POST(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "unauthorized" }, { status: 401 });
  const { id } = await params;
  const agent = AgentKey.safeParse((await req.json().catch(() => ({})))?.agent);
  if (!agent.success) return Response.json({ error: "unknown agent" }, { status: 400 });
  return Response.json(await pauseAgent(agent.data, user.login, id));
}
