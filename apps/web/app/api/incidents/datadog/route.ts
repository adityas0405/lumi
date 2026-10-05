import { fromDatadog } from "@lumi/core";
import { createIncident } from "@lumi/pipeline";
import { checkIncidentWebhook } from "@/lib/webhook-auth";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.text();
  if (!checkIncidentWebhook(req, body)) return new Response("unauthorized", { status: 401 });
  const { incidentId } = await createIncident(fromDatadog(JSON.parse(body)));
  return Response.json({ incidentId });
}
