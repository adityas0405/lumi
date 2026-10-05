import type {
  AgentKey,
  EvidenceKind,
  EvidencePayload,
  FileChange,
  TaskStatus,
  TriageSignal,
} from "@lumi/core";
import { sql } from "drizzle-orm";
import {
  type AnyPgColumn,
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  real,
  text,
  timestamp,
  unique,
  uniqueIndex,
  uuid,
} from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().default(sql`gen_random_uuid()`);
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());

export interface RepoSettings {
  retentionDays: number;
  rollbackWebhookUrl: string | null;
  /** Path prefix -> area name, used by the activity map's "area" grouping. */
  areas: Record<string, string>;
  mentionPrefixes: Partial<Record<AgentKey, string>>;
  closeOnReject: boolean;
  /** Days an open change may wait on the reviewer or the agent before it counts as held up. */
  heldUpDays?: number;
}

export const repos = pgTable("repos", {
  id: id(),
  /** Null for repos known only through SDK reports. */
  githubId: bigint("github_id", { mode: "number" }).unique(),
  fullName: text("full_name").notNull().unique(),
  installationId: bigint("installation_id", { mode: "number" }),
  defaultBranch: text("default_branch").notNull().default("main"),
  settings: jsonb("settings").$type<RepoSettings>().notNull(),
  createdAt: createdAt(),
});

export const agents = pgTable("agents", {
  key: text("key").$type<AgentKey>().primaryKey(),
  name: text("name").notNull(),
  color: text("color").notNull(),
  voiceId: text("voice_id"),
  modelFamily: text("model_family").notNull(),
  pausedAt: timestamp("paused_at", { withTimezone: true }),
  pausedBy: text("paused_by"),
});

export const tasks = pgTable(
  "tasks",
  {
    id: id(),
    repoId: uuid("repo_id")
      .notNull()
      .references(() => repos.id, { onDelete: "cascade" }),
    agent: text("agent").$type<AgentKey>().notNull(),
    agentDetection: text("agent_detection").notNull(),
    source: text("source").$type<"github" | "sdk">().notNull(),
    /** Idempotency key: "github:owner/repo#12" or an SDK-supplied id. */
    externalId: text("external_id").notNull(),
    prNumber: integer("pr_number"),
    prUrl: text("pr_url"),
    title: text("title").notNull(),
    branch: text("branch"),
    baseSha: text("base_sha"),
    headSha: text("head_sha"),
    authorLogin: text("author_login"),
    /** What the agent said about its own work. Untrusted; never narrated as fact. */
    agentClaim: text("agent_claim").notNull().default(""),
    labels: jsonb("labels").$type<string[]>().notNull().default([]),
    prState: text("pr_state").$type<"open" | "closed" | "merged">().notNull().default("open"),
    status: text("status").$type<TaskStatus>().notNull().default("ingesting"),
    statusDetail: text("status_detail"),
    progress: real("progress").notNull().default(0),
    additions: integer("additions").notNull().default(0),
    deletions: integer("deletions").notNull().default(0),
    files: jsonb("files").$type<FileChange[]>().notNull().default([]),
    secretFindings: jsonb("secret_findings")
      .$type<{ kind: string; preview: string; ref: string }[]>()
      .notNull()
      .default([]),
    /** Demo ground truth only; hidden unless planted-error mode is on. */
    plantedError: text("planted_error"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
    mergedAt: timestamp("merged_at", { withTimezone: true }),
    mergeCommitSha: text("merge_commit_sha"),
    /** The task this one reverts (a rollback or revert PR); such tasks get no narrated review. */
    revertOf: uuid("revert_of").references((): AnyPgColumn => tasks.id, { onDelete: "set null" }),
    /** When the agent last pushed new commits, for telling whether it answered a review. */
    headChangedAt: timestamp("head_changed_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [
    uniqueIndex("tasks_external_id").on(t.externalId),
    index("tasks_repo_occurred").on(t.repoId, t.occurredAt),
    index("tasks_status").on(t.status),
  ],
);

export const evidence = pgTable(
  "evidence",
  {
    id: id(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    ref: text("ref").notNull(),
    kind: text("kind").$type<EvidenceKind>().notNull(),
    title: text("title").notNull(),
    payload: jsonb("payload").$type<EvidencePayload>().notNull(),
    blobPath: text("blob_path"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("evidence_task_ref").on(t.taskId, t.ref)],
);

export const triageResults = pgTable("triage_results", {
  id: id(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  route: text("route").$type<"auto_pass" | "needs_human" | "block">().notNull(),
  wouldAutoPass: boolean("would_auto_pass").notNull(),
  score: real("score").notNull(),
  summary: text("summary").notNull().default(""),
  signals: jsonb("signals").$type<TriageSignal[]>().notNull(),
  reasons: jsonb("reasons").$type<{ text: string; refs: string[] }[]>().notNull(),
  suspectedDefects: jsonb("suspected_defects")
    .$type<{ summary: string; explanation: string; refs: string[]; severity: string }[]>()
    .notNull(),
  model: text("model").notNull(),
  createdAt: createdAt(),
});

export const scripts = pgTable("scripts", {
  id: id(),
  subjectType: text("subject_type").$type<"task" | "digest">().notNull(),
  subjectId: uuid("subject_id").notNull(),
  version: integer("version").notNull().default(1),
  /** Chapters -> sentences with refs, confidence and plain-language text. */
  body: jsonb("body").notNull(),
  validation: jsonb("validation").notNull(),
  attempts: integer("attempts").notNull(),
  model: text("model").notNull(),
  createdAt: createdAt(),
});

export const renders = pgTable("renders", {
  id: id(),
  subjectType: text("subject_type").$type<"task" | "digest">().notNull(),
  subjectId: uuid("subject_id").notNull(),
  scriptId: uuid("script_id").references(() => scripts.id, { onDelete: "set null" }),
  status: text("status").$type<"queued" | "voicing" | "rendering" | "ready" | "failed">().notNull(),
  progress: real("progress").notNull().default(0),
  videoPath: text("video_path"),
  posterPath: text("poster_path"),
  timeline: jsonb("timeline"),
  captionsVtt: text("captions_vtt"),
  durationMs: integer("duration_ms"),
  error: text("error"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const decisions = pgTable("decisions", {
  id: id(),
  taskId: uuid("task_id")
    .notNull()
    .references(() => tasks.id, { onDelete: "cascade" }),
  kind: text("kind").$type<"approve" | "reject" | "request_changes">().notNull(),
  feedback: text("feedback"),
  decidedBy: text("decided_by").notNull(),
  githubReviewId: text("github_review_id"),
  deliveredAt: timestamp("delivered_at", { withTimezone: true }),
  deliveryError: text("delivery_error"),
  createdAt: createdAt(),
});

/** A reviewer's question about one task, or (with `digestId`) across a digest's tasks. */
export const questions = pgTable("questions", {
  id: id(),
  taskId: uuid("task_id").references(() => tasks.id, { onDelete: "cascade" }),
  digestId: uuid("digest_id").references(() => digests.id, { onDelete: "cascade" }),
  question: text("question").notNull(),
  answer: jsonb("answer").$type<{ text: string; refs: string[] }[]>(),
  notInEvidence: boolean("not_in_evidence").notNull().default(false),
  askedBy: text("asked_by").notNull(),
  videoTimeMs: integer("video_time_ms"),
  createdAt: createdAt(),
});

export const deploys = pgTable("deploys", {
  id: id(),
  repoId: uuid("repo_id")
    .notNull()
    .references(() => repos.id, { onDelete: "cascade" }),
  githubDeploymentId: bigint("github_deployment_id", { mode: "number" }).unique(),
  environment: text("environment").notNull(),
  sha: text("sha").notNull(),
  previousSha: text("previous_sha"),
  status: text("status").notNull(),
  environmentUrl: text("environment_url"),
  taskIds: jsonb("task_ids").$type<string[]>().notNull().default([]),
  /** Pull requests shipped by this deploy; kept so late-ingested tasks can be linked. */
  prNumbers: jsonb("pr_numbers").$type<number[]>().notNull().default([]),
  deployedAt: timestamp("deployed_at", { withTimezone: true }).notNull(),
});

export interface IncidentSuspect {
  taskId: string;
  score: number;
  confidence: "high" | "medium" | "low";
  reasons: string[];
}

export const incidents = pgTable("incidents", {
  id: id(),
  repoId: uuid("repo_id").references(() => repos.id, { onDelete: "cascade" }),
  source: text("source").$type<"sentry" | "datadog" | "simulated">().notNull(),
  severity: text("severity").$type<"sev1" | "sev2" | "sev3">().notNull(),
  title: text("title").notNull(),
  service: text("service"),
  environment: text("environment"),
  stats: jsonb("stats").notNull(),
  frames: jsonb("frames")
    .$type<{ file: string; line: number | null; fn: string | null }[]>()
    .notNull(),
  deployId: uuid("deploy_id").references(() => deploys.id, { onDelete: "set null" }),
  suspects: jsonb("suspects").$type<IncidentSuspect[]>().notNull().default([]),
  slackTs: text("slack_ts"),
  status: text("status").$type<"open" | "mitigating" | "resolved">().notNull().default("open"),
  actions: jsonb("actions")
    .$type<{ kind: string; by: string; at: string; ref?: string; detail?: string }[]>()
    .notNull()
    .default([]),
  startedAt: timestamp("started_at", { withTimezone: true }).notNull(),
  createdAt: createdAt(),
});

/** What happened to a change after review. One row per (task, kind, ref), so re-ingests are safe. */
export const outcomes = pgTable(
  "outcomes",
  {
    id: id(),
    taskId: uuid("task_id")
      .notNull()
      .references(() => tasks.id, { onDelete: "cascade" }),
    kind: text("kind").$type<OutcomeKind>().notNull(),
    detail: text("detail"),
    ref: text("ref"),
    occurredAt: timestamp("occurred_at", { withTimezone: true }).notNull(),
  },
  (t) => [unique("outcomes_task_kind_ref").on(t.taskId, t.kind, t.ref).nullsNotDistinct()],
);
export type OutcomeKind = "merged" | "reverted" | "incident_linked" | "held_up";

export const digests = pgTable("digests", {
  id: id(),
  repoId: uuid("repo_id")
    .notNull()
    .references(() => repos.id, { onDelete: "cascade" }),
  day: text("day").notNull(),
  counts: jsonb("counts").$type<{ decisions: number; problems: number; done: number }>().notNull(),
  slackTs: text("slack_ts"),
  createdAt: createdAt(),
});

/** When each signed-in person was last here, so screens can say "since your last visit". */
export const userVisits = pgTable("user_visits", {
  login: text("login").primaryKey(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).notNull(),
  visitStartedAt: timestamp("visit_started_at", { withTimezone: true }).notNull(),
  previousVisitAt: timestamp("previous_visit_at", { withTimezone: true }),
});

export const llmCache = pgTable("llm_cache", {
  key: text("key").primaryKey(),
  model: text("model").notNull(),
  purpose: text("purpose").notNull(),
  response: jsonb("response").notNull(),
  usage: jsonb("usage"),
  createdAt: createdAt(),
});

export const ttsCache = pgTable("tts_cache", {
  key: text("key").primaryKey(),
  provider: text("provider").notNull(),
  audioPath: text("audio_path").notNull(),
  alignment: jsonb("alignment").notNull(),
  durationMs: integer("duration_ms").notNull(),
  createdAt: createdAt(),
});

export const webhookEvents = pgTable("webhook_events", {
  /** Provider delivery id (e.g. X-GitHub-Delivery); makes redelivery idempotent. */
  id: text("id").primaryKey(),
  provider: text("provider").notNull(),
  event: text("event").notNull(),
  payload: jsonb("payload").notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  error: text("error"),
  receivedAt: createdAt(),
});

/**
 * Evidence an agent reported through the SDK for a pull request (decision logs,
 * session logs, recordings). Kept separately so it survives re-ingesting the PR
 * and can arrive before Lumi has seen the PR at all.
 */
export const agentEvidence = pgTable(
  "agent_evidence",
  {
    id: id(),
    externalId: text("external_id").notNull(),
    ref: text("ref").notNull(),
    evidence: jsonb("evidence").$type<import("@lumi/core").Evidence>().notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("agent_evidence_ref").on(t.externalId, t.ref)],
);
