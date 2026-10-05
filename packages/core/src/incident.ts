import { z } from "zod";

/** A normalized production incident, whatever tool reported it. */
export const IncidentInput = z.object({
  source: z.enum(["sentry", "datadog", "simulated"]),
  title: z.string(),
  service: z.string().nullable(),
  environment: z.string().nullable(),
  severity: z.enum(["sev1", "sev2", "sev3"]),
  startedAt: z.string(),
  url: z.string().nullable(),
  stats: z.object({
    events: z.number().int().nullable(),
    users: z.number().int().nullable(),
    windowMinutes: z.number().int().nullable(),
    baselineEvents: z.number().int().nullable(),
  }),
  tags: z.record(z.string(), z.string()),
  frames: z.array(
    z.object({ file: z.string(), line: z.number().int().nullable(), fn: z.string().nullable() }),
  ),
});
export type IncidentInput = z.infer<typeof IncidentInput>;

export interface DeployForCorrelation {
  id: string;
  sha: string;
  deployedAt: Date;
  taskIds: string[];
}

export interface TaskForCorrelation {
  id: string;
  title: string;
  agent: string;
  route: "auto_pass" | "needs_human" | "block" | null;
  /** Changed ranges per file (new-file line numbers). */
  changes: { path: string; start: number; end: number }[];
}

export interface Suspect {
  taskId: string;
  deployId: string;
  score: number;
  confidence: "high" | "medium" | "low";
  reasons: string[];
}

export interface Correlation {
  deploy: DeployForCorrelation | null;
  minutesSinceDeploy: number | null;
  suspects: Suspect[];
}

/** How far back a deploy can still be the cause of a new spike. */
export const CORRELATION_WINDOW_HOURS = 24;

const norm = (p: string) =>
  p.replace(/^(\.\/|\/)?(app\/|webpack:\/\/\/?|\.\/)?/, "").replace(/^.*?(src\/)/, "$1");

/**
 * Ranks the agent changes behind an incident. The most recent deploy before the
 * spike is the prime suspect; within it, a change whose lines appear in the
 * stack trace outranks one that only touched the same file, which outranks one
 * that merely shipped in the same deploy. A change triage had blocked is noted.
 */
export function correlate(
  incident: IncidentInput,
  deploys: DeployForCorrelation[],
  tasks: TaskForCorrelation[],
): Correlation {
  const started = new Date(incident.startedAt).getTime();
  const earlier = deploys
    .filter(
      (d) =>
        d.deployedAt.getTime() <= started &&
        started - d.deployedAt.getTime() <= CORRELATION_WINDOW_HOURS * 3_600_000,
    )
    .sort((a, b) => b.deployedAt.getTime() - a.deployedAt.getTime());
  const deploy = earlier[0] ?? null;
  if (!deploy) return { deploy: null, minutesSinceDeploy: null, suspects: [] };
  const minutes = Math.round((started - deploy.deployedAt.getTime()) / 60_000);

  const frames = incident.frames.map((f) => ({ ...f, file: norm(f.file) }));
  const byId = new Map(tasks.map((t) => [t.id, t]));
  const suspects: Suspect[] = [];
  for (const taskId of deploy.taskIds) {
    const t = byId.get(taskId);
    if (!t) continue;
    const reasons: string[] = [
      `Shipped in the deploy ${minutes} minute${minutes === 1 ? "" : "s"} before the spike`,
    ];
    let score = 0.2;
    const lineHits = frames.filter(
      (f) =>
        f.line !== null &&
        t.changes.some((c) => norm(c.path) === f.file && f.line! >= c.start && f.line! <= c.end),
    );
    const fileHits = frames.filter((f) => t.changes.some((c) => norm(c.path) === f.file));
    if (lineHits.length) {
      score += 0.55;
      const f = lineHits[0]!;
      reasons.push(
        `The stack trace passes through lines it changed (${f.file}:${f.line}${f.fn ? ` in ${f.fn}` : ""})`,
      );
    } else if (fileHits.length) {
      score += 0.3;
      reasons.push(`The stack trace passes through a file it changed (${fileHits[0]!.file})`);
    }
    if (t.route === "block") {
      score += 0.15;
      reasons.push("Lumi's triage had blocked this change before it merged");
    } else if (t.route === "needs_human") {
      score += 0.05;
    }
    // Recent deploys are likelier culprits.
    score += minutes <= 60 ? 0.1 : minutes <= 360 ? 0.05 : 0;
    score = Math.min(1, Math.round(score * 100) / 100);
    suspects.push({
      taskId,
      deployId: deploy.id,
      score,
      confidence: lineHits.length ? "high" : fileHits.length ? "medium" : "low",
      reasons,
    });
  }
  suspects.sort((a, b) => b.score - a.score);
  return { deploy, minutesSinceDeploy: minutes, suspects };
}

/** Sentry issue/event alert webhook → incident. */
export function fromSentry(body: unknown, now = new Date()): IncidentInput {
  const b = body as {
    data?: {
      event?: {
        title?: string;
        environment?: string;
        web_url?: string;
        datetime?: string;
        tags?: [string, string][];
        exception?: {
          values?: {
            stacktrace?: {
              frames?: {
                filename?: string;
                abs_path?: string;
                lineno?: number;
                function?: string;
                in_app?: boolean;
              }[];
            };
          }[];
        };
      };
      triggered_rule?: string;
    };
    lumi?: {
      events?: number;
      users?: number;
      windowMinutes?: number;
      baselineEvents?: number;
      severity?: "sev1" | "sev2" | "sev3";
      service?: string;
    };
  };
  const ev = b.data?.event ?? {};
  const frames = (ev.exception?.values ?? [])
    .flatMap((v) => v.stacktrace?.frames ?? [])
    .filter((f) => f.in_app !== false)
    .reverse() // Sentry lists the innermost frame last.
    .map((f) => ({
      file: f.filename ?? f.abs_path ?? "",
      line: f.lineno ?? null,
      fn: f.function ?? null,
    }))
    .filter((f) => f.file);
  const tags = Object.fromEntries(ev.tags ?? []);
  const events = b.lumi?.events ?? null;
  return {
    source: "sentry",
    title: ev.title ?? "Error spike",
    service: b.lumi?.service ?? tags.service ?? null,
    environment: ev.environment ?? tags.environment ?? null,
    severity: b.lumi?.severity ?? (events !== null && events >= 500 ? "sev1" : "sev2"),
    startedAt: ev.datetime ?? now.toISOString(),
    url: ev.web_url ?? null,
    stats: {
      events,
      users: b.lumi?.users ?? null,
      windowMinutes: b.lumi?.windowMinutes ?? null,
      baselineEvents: b.lumi?.baselineEvents ?? null,
    },
    tags,
    frames,
  };
}

/** Datadog monitor webhook (Lumi's recommended payload template) → incident. */
export function fromDatadog(body: unknown, now = new Date()): IncidentInput {
  const b = body as {
    title?: string;
    service?: string;
    env?: string;
    priority?: string;
    date?: number;
    link?: string;
    events?: number;
    tags?: string;
  };
  const tags = Object.fromEntries(
    (b.tags ?? "")
      .split(",")
      .map((t) => t.trim().split(":") as [string, string?])
      .filter(([k, v]) => k && v)
      .map(([k, v]) => [k, v!]),
  );
  return {
    source: "datadog",
    title: b.title ?? "Monitor alert",
    service: b.service ?? tags.service ?? null,
    environment: b.env ?? tags.env ?? null,
    severity: b.priority === "P1" ? "sev1" : b.priority === "P2" ? "sev2" : "sev3",
    startedAt: b.date ? new Date(b.date).toISOString() : now.toISOString(),
    url: b.link ?? null,
    stats: { events: b.events ?? null, users: null, windowMinutes: null, baselineEvents: null },
    tags,
    frames: [],
  };
}
