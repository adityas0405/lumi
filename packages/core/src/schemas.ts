import { z } from "zod";

export const AgentKey = z.enum(["claude-code", "cursor", "devin", "unknown"]);
export type AgentKey = z.infer<typeof AgentKey>;

export const TaskStatus = z.enum([
  "ingesting",
  "triaging",
  "scripting",
  "rendering",
  "ready",
  "decided",
  "failed",
]);
export type TaskStatus = z.infer<typeof TaskStatus>;

export const EvidenceKind = z.enum([
  "diff_hunk",
  "file",
  "test_case",
  "ci_step",
  "screenshot",
  "log",
  "agent_artifact",
  "agent_claim",
  "task",
  "code",
  "doc",
  "module_map",
  "decision",
]);
export type EvidenceKind = z.infer<typeof EvidenceKind>;

export const DiffLine = z.object({
  type: z.enum(["add", "del", "ctx"]),
  text: z.string(),
  oldLine: z.number().int().nullable(),
  newLine: z.number().int().nullable(),
});
export type DiffLine = z.infer<typeof DiffLine>;

export const DiffHunk = z.object({
  file: z.string(),
  header: z.string(),
  oldStart: z.number().int(),
  oldLines: z.number().int(),
  newStart: z.number().int(),
  newLines: z.number().int(),
  additions: z.number().int(),
  deletions: z.number().int(),
  lines: z.array(DiffLine),
});
export type DiffHunk = z.infer<typeof DiffHunk>;

export const FileChange = z.object({
  path: z.string(),
  previousPath: z.string().nullable(),
  status: z.enum(["added", "modified", "removed", "renamed", "copied", "changed", "unchanged"]),
  additions: z.number().int(),
  deletions: z.number().int(),
  binary: z.boolean(),
  /** True when the patch was withheld (secrets file, generated file, too large). */
  withheld: z.boolean(),
  withheldReason: z.string().nullable(),
});
export type FileChange = z.infer<typeof FileChange>;

export const TestCaseResult = z.object({
  name: z.string(),
  suite: z.string().nullable(),
  status: z.enum(["passed", "failed", "skipped"]),
  durationMs: z.number().nullable(),
  message: z.string().nullable(),
});
export type TestCaseResult = z.infer<typeof TestCaseResult>;

export const CiStep = z.object({
  name: z.string(),
  conclusion: z.enum([
    "success",
    "failure",
    "neutral",
    "cancelled",
    "skipped",
    "timed_out",
    "pending",
  ]),
  url: z.string().nullable(),
  summary: z.string().nullable(),
});
export type CiStep = z.infer<typeof CiStep>;

/** Payload shapes per evidence kind. Everything here has already been redacted. */
export const EvidencePayload = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("diff_hunk"), hunk: DiffHunk }),
  z.object({ kind: z.literal("file"), file: FileChange }),
  z.object({ kind: z.literal("test_case"), test: TestCaseResult }),
  z.object({ kind: z.literal("ci_step"), step: CiStep }),
  z.object({
    kind: z.literal("screenshot"),
    label: z.string(),
    variant: z.enum(["before", "after", "single"]),
    width: z.number().int(),
    height: z.number().int(),
    highlight: z.object({ x: z.number(), y: z.number(), w: z.number(), h: z.number() }).nullable(),
  }),
  z.object({ kind: z.literal("log"), source: z.string(), text: z.string() }),
  z.object({
    kind: z.literal("agent_artifact"),
    artifactType: z.enum(["video", "image", "link"]),
    url: z.string(),
    label: z.string(),
  }),
  z.object({ kind: z.literal("agent_claim"), text: z.string() }),
  /** What the agent was asked to do (a linked issue or ticket). Written by people. */
  z.object({
    kind: z.literal("task"),
    source: z.string(),
    title: z.string(),
    body: z.string(),
    url: z.string().nullable(),
    /** Login of the person who filed the request, when known. */
    requestedBy: z.string().nullable().optional(),
    /** Their display name, for narration; a handle doesn't read well aloud. */
    requestedByName: z.string().nullable().optional(),
  }),
  /** Unchanged code around the change, at the base commit. */
  z.object({
    kind: z.literal("code"),
    path: z.string(),
    startLine: z.number().int(),
    lines: z.array(z.string()),
  }),
  /** Project documentation such as the README. */
  z.object({ kind: z.literal("doc"), path: z.string(), text: z.string() }),
  /** Modules around the change and how they import each other. */
  z.object({
    kind: z.literal("module_map"),
    modules: z.array(
      z.object({
        id: z.string(),
        files: z.number().int(),
        changed: z.boolean(),
        changedLines: z.number().int(),
      }),
    ),
    edges: z.array(z.object({ from: z.string(), to: z.string() })),
  }),
  /** A decision the agent recorded while working (from its session log, via the SDK). */
  z.object({
    kind: z.literal("decision"),
    title: z.string(),
    chosen: z.string(),
    alternatives: z.array(z.string()),
    rationale: z.string(),
  }),
]);
export type EvidencePayload = z.infer<typeof EvidencePayload>;

export const Evidence = z.object({
  ref: z.string(),
  kind: EvidenceKind,
  title: z.string(),
  payload: EvidencePayload,
  blobPath: z.string().nullable(),
});
export type Evidence = z.infer<typeof Evidence>;

/** The normalized record every source (GitHub, SDK) produces. */
export const NormalizedTask = z.object({
  source: z.enum(["github", "sdk"]),
  externalId: z.string(),
  repoFullName: z.string(),
  prNumber: z.number().int().nullable(),
  prUrl: z.string().nullable(),
  title: z.string(),
  branch: z.string().nullable(),
  baseSha: z.string().nullable(),
  headSha: z.string().nullable(),
  authorLogin: z.string().nullable(),
  agent: AgentKey,
  agentDetection: z.string(),
  agentClaim: z.string(),
  labels: z.array(z.string()),
  state: z.enum(["open", "closed", "merged"]),
  occurredAt: z.string(),
  mergedAt: z.string().nullable(),
  mergeCommitSha: z.string().nullable(),
  /** What this change reverts, when it is a revert (commit SHAs and PR numbers). */
  reverts: z.object({ shas: z.array(z.string()), prNumbers: z.array(z.number().int()) }).nullable(),
  additions: z.number().int(),
  deletions: z.number().int(),
  files: z.array(FileChange),
  evidence: z.array(Evidence),
});
export type NormalizedTask = z.infer<typeof NormalizedTask>;
