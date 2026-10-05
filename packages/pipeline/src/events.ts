import { getPool } from "@lumi/db";

export type LumiEvent =
  | { type: "task.updated"; taskId: string; status: string; progress: number }
  | { type: "deploys.updated"; repo: string }
  | { type: "incident.created"; incidentId: string }
  | { type: "digest.ready"; digestId: string };

export const EVENTS_CHANNEL = "lumi_events";

/** Broadcasts a change over Postgres NOTIFY; the web app relays it to browsers via SSE. */
export async function publish(event: LumiEvent): Promise<void> {
  await getPool().query("select pg_notify($1, $2)", [EVENTS_CHANNEL, JSON.stringify(event)]);
}
