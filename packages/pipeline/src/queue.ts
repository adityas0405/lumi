import { databaseUrl } from "@lumi/db";
import { PgBoss, type SendOptions } from "pg-boss";

export const QUEUES = {
  ingestPr: "ingest.pr",
  syncRepo: "sync.repo",
  syncDeploys: "sync.deploys",
  capture: "review.capture",
  triage: "review.triage",
  script: "review.script",
  render: "review.render",
  digest: "digest.build",
  sweep: "outcomes.sweep",
} as const;

export type QueueName = (typeof QUEUES)[keyof typeof QUEUES];

export interface JobData {
  "ingest.pr": { repo: string; number: number; installationId?: number | null; reason: string };
  "sync.repo": { repo: string; installationId?: number | null };
  "sync.deploys": { repo: string; installationId?: number | null };
  "review.capture": { taskId: string };
  "review.triage": { taskId: string };
  "review.script": { taskId: string };
  "review.render": { taskId: string };
  "digest.build": { repoId?: string };
  "outcomes.sweep": Record<string, never>;
}

let boss: Promise<PgBoss> | null = null;

/** Shared pg-boss instance (one per process). Queues are created on first start. */
export function getBoss(): Promise<PgBoss> {
  boss ??= (async () => {
    const b = new PgBoss({ connectionString: databaseUrl(), useListenNotify: true });
    b.on("error", (err) => console.error("[pg-boss]", err));
    await b.start();
    for (const name of Object.values(QUEUES)) {
      await b.createQueue(name, { notify: true, retryLimit: 3, retryDelay: 5, retryBackoff: true });
    }
    return b;
  })();
  return boss;
}

export async function enqueue<Q extends QueueName>(
  name: Q,
  data: JobData[Q],
  options: SendOptions = {},
): Promise<string | null> {
  return (await getBoss()).send(name, data, options);
}

export async function enqueueAfter<Q extends QueueName>(
  name: Q,
  data: JobData[Q],
  seconds: number,
  options: SendOptions = {},
): Promise<string | null> {
  return (await getBoss()).sendAfter(name, data, options, seconds);
}

export async function stopBoss(): Promise<void> {
  if (!boss) return;
  const b = await boss;
  boss = null;
  await b.stop({ graceful: true });
}
