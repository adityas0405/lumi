import { getDb, webhookEvents } from "@lumi/db";
import { eq } from "drizzle-orm";
import { log } from "./log";
import { enqueue } from "./queue";

interface RepoRef {
  full_name: string;
}
interface Payload {
  action?: string;
  installation?: { id: number };
  repository?: RepoRef;
  pull_request?: { number: number };
  check_run?: { pull_requests?: { number: number }[] };
  check_suite?: { pull_requests?: { number: number }[] };
  workflow_run?: { pull_requests?: { number: number }[]; event?: string };
  deployment_status?: { state: string };
  repositories?: RepoRef[];
  repositories_added?: RepoRef[];
}

const PR_ACTIONS = new Set([
  "opened",
  "reopened",
  "synchronize",
  "edited",
  "closed",
  "labeled",
  "unlabeled",
  "ready_for_review",
]);

/**
 * Records a GitHub webhook delivery (idempotently) and turns it into jobs.
 * Returns false when the delivery was already processed.
 */
export async function handleGithubWebhook(
  deliveryId: string,
  event: string,
  payload: Payload,
): Promise<boolean> {
  const db = getDb();
  const inserted = await db
    .insert(webhookEvents)
    .values({ id: deliveryId, provider: "github", event, payload })
    .onConflictDoNothing()
    .returning({ id: webhookEvents.id });
  if (inserted.length === 0) return false;

  const installationId = payload.installation?.id ?? null;
  const repo = payload.repository?.full_name;
  const ingest = (number: number, reason: string) =>
    repo ? enqueue("ingest.pr", { repo, number, installationId, reason }) : Promise.resolve(null);

  switch (event) {
    case "pull_request":
      if (payload.pull_request && PR_ACTIONS.has(payload.action ?? "")) {
        await ingest(payload.pull_request.number, `pull_request.${payload.action}`);
      }
      break;
    case "check_run":
    case "check_suite":
    case "workflow_run": {
      const prs =
        payload.check_run?.pull_requests ??
        payload.check_suite?.pull_requests ??
        payload.workflow_run?.pull_requests ??
        [];
      if (payload.action === "completed")
        for (const pr of prs) await ingest(pr.number, `${event}.completed`);
      break;
    }
    case "deployment_status":
      if (repo && payload.deployment_status?.state === "success") {
        await enqueue(
          "sync.deploys",
          { repo, installationId },
          { singletonKey: `deploys:${repo}`, singletonSeconds: 5 },
        );
      }
      break;
    case "installation":
    case "installation_repositories":
      for (const r of [...(payload.repositories ?? []), ...(payload.repositories_added ?? [])]) {
        await enqueue("sync.repo", { repo: r.full_name, installationId });
      }
      break;
    default:
      break;
  }

  await db
    .update(webhookEvents)
    .set({ processedAt: new Date() })
    .where(eq(webhookEvents.id, deliveryId));
  log.info({ event, action: payload.action, repo, deliveryId }, "webhook handled");
  return true;
}
