import { AgentKey } from "@lumi/core";
import { log, pauseAgent, rollbackIncident } from "@lumi/pipeline";
import { checkSlackSignature } from "@/lib/webhook-auth";

export const dynamic = "force-dynamic";

/** Button clicks from Slack alerts (Roll back, Pause agent). Verified with Slack's signing secret. */
export async function POST(req: Request) {
  const body = await req.text();
  if (!checkSlackSignature(req, body)) return new Response("unauthorized", { status: 401 });
  const payload = JSON.parse(new URLSearchParams(body).get("payload") ?? "{}") as {
    user?: { username?: string; name?: string };
    actions?: { action_id: string; value?: string }[];
    response_url?: string;
  };
  const who = payload.user?.username ?? payload.user?.name ?? "slack-user";
  const action = payload.actions?.[0];
  let text = "Nothing to do.";
  try {
    if (action?.action_id === "rollback" && action.value) {
      const r = await rollbackIncident(action.value, who);
      text = r.url ? `Rollback opened by @${who}: ${r.url}` : `Rollback triggered by @${who}.`;
    } else if (action?.action_id === "pause_agent" && action.value) {
      const [incidentId, agent] = action.value.split(":");
      const parsed = AgentKey.safeParse(agent);
      if (parsed.success) {
        await pauseAgent(parsed.data, who, incidentId);
        text = `${agent} paused by @${who}.`;
      }
    }
  } catch (err) {
    text = `Couldn't do that: ${err instanceof Error ? err.message : String(err)}`;
    log.error({ err: text }, "slack action failed");
  }
  if (payload.response_url) {
    await fetch(payload.response_url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text, replace_original: false }),
    });
  }
  return new Response(null, { status: 200 });
}
