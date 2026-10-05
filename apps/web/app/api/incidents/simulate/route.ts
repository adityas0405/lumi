import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fromSentry } from "@lumi/core";
import { createIncident } from "@lumi/pipeline";
import { currentUser } from "@/lib/session";

export const dynamic = "force-dynamic";

/**
 * Demo: replays a recorded Sentry alert (LUMI_SIMULATE_FIXTURE) as if the spike
 * started now. Everything after that (correlation, the alert, rollback) is real.
 */
export async function POST() {
  if (!(await currentUser())) return Response.json({ error: "unauthorized" }, { status: 401 });
  const file = resolve(
    process.env.LUMI_ROOT ?? process.cwd(),
    process.env.LUMI_SIMULATE_FIXTURE ?? "demo/incidents/checkout-zone-crash.json",
  );
  const payload = JSON.parse(readFileSync(file, "utf8"));
  payload.data.event.datetime = new Date().toISOString();
  const { incidentId } = await createIncident({ ...fromSentry(payload), source: "simulated" });
  return Response.json({ incidentId });
}
