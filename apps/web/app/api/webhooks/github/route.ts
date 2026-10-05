import { verifyGithubSignature } from "@lumi/github";
import { handleGithubWebhook, log } from "@lumi/pipeline";

export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  const body = await req.text();
  const ok = await verifyGithubSignature(body, req.headers.get("x-hub-signature-256"));
  if (!ok) return new Response("invalid signature", { status: 401 });

  const event = req.headers.get("x-github-event") ?? "unknown";
  const delivery = req.headers.get("x-github-delivery") ?? crypto.randomUUID();
  try {
    const fresh = await handleGithubWebhook(delivery, event, JSON.parse(body));
    return Response.json({ ok: true, duplicate: !fresh });
  } catch (err) {
    log.error({ err, event, delivery }, "webhook handling failed");
    return new Response("webhook handling failed", { status: 500 });
  }
}
