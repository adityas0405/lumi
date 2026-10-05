import {
  AgentKey,
  type Evidence,
  type FileChange,
  hunkRange,
  isGeneratedFile,
  isSecretFile,
  type NormalizedTask,
  parsePatch,
  redact,
  redactLines,
  refs,
} from "@lumi/core";
import { z } from "zod";

/** What an agent sends with `lumi.report(task, evidence)`. */
export const SdkReport = z.object({
  task: z.object({
    id: z.string().min(1).max(200),
    title: z.string().min(1).max(300),
    agent: z.string().min(1).max(60),
    repo: z.string().regex(/^[\w.-]+\/[\w.-]+$/, "repo must look like owner/name"),
    description: z.string().max(20_000).optional(),
    url: z.string().url().optional(),
    branch: z.string().max(200).optional(),
    occurredAt: z.string().datetime({ offset: true }).optional(),
    /** Attach this report to an existing pull request's review instead of creating a task. */
    pullRequest: z.number().int().positive().optional(),
  }),
  evidence: z
    .array(
      z.discriminatedUnion("kind", [
        z.object({
          kind: z.literal("diff"),
          file: z.string(),
          patch: z.string(),
          status: z.enum(["added", "modified", "removed"]).optional(),
        }),
        z.object({
          kind: z.literal("test"),
          name: z.string(),
          status: z.enum(["passed", "failed", "skipped"]),
          suite: z.string().optional(),
          message: z.string().optional(),
        }),
        z.object({
          kind: z.literal("ci"),
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
          url: z.string().url().optional(),
          summary: z.string().optional(),
        }),
        z.object({ kind: z.literal("log"), source: z.string(), text: z.string().max(50_000) }),
        z.object({
          kind: z.literal("decision"),
          title: z.string().max(300),
          chosen: z.string().max(2000),
          alternatives: z.array(z.string().max(1000)).max(10).default([]),
          rationale: z.string().max(4000),
        }),
        z.object({
          kind: z.literal("artifact"),
          type: z.enum(["video", "image", "link"]),
          url: z.string().url(),
          label: z.string(),
        }),
      ]),
    )
    .max(500)
    .default([]),
});
export type SdkReport = z.infer<typeof SdkReport>;

const KNOWN_AGENTS = new Set(AgentKey.options);

export function normalizeSdkReport(report: SdkReport): {
  task: NormalizedTask;
  secretFindings: { kind: string; preview: string; ref: string }[];
} {
  const evidence: Evidence[] = [];
  const secretFindings: { kind: string; preview: string; ref: string }[] = [];
  const files: FileChange[] = [];
  const claim = redact(report.task.description ?? "");
  for (const f of claim.findings) secretFindings.push({ ...f, ref: refs.claim() });
  evidence.push({
    ref: refs.claim(),
    kind: "agent_claim",
    title: "What the agent said about this change",
    payload: { kind: "agent_claim", text: claim.text },
    blobPath: null,
  });

  let artifactIndex = 0;
  let decisionIndex = 0;
  for (const e of report.evidence) {
    switch (e.kind) {
      case "diff": {
        const withheld = isSecretFile(e.file)
          ? "secrets file: contents never read"
          : isGeneratedFile(e.file)
            ? "generated file"
            : null;
        const hunks = withheld ? [] : parsePatch(e.file, e.patch);
        files.push({
          path: e.file,
          previousPath: null,
          status: e.status ?? "modified",
          additions: hunks.reduce((n, h) => n + h.additions, 0),
          deletions: hunks.reduce((n, h) => n + h.deletions, 0),
          binary: false,
          withheld: withheld !== null,
          withheldReason: withheld,
        });
        evidence.push({
          ref: refs.file(e.file),
          kind: "file",
          title: e.file,
          payload: { kind: "file", file: files.at(-1)! },
          blobPath: null,
        });
        for (const hunk of hunks) {
          const r = redactLines(hunk.lines.map((l) => l.text));
          hunk.lines = hunk.lines.map((l, i) => ({ ...l, text: r.lines[i]! }));
          const { start, end } = hunkRange(hunk);
          const ref = refs.diff(e.file, start, end);
          for (const f of r.findings) secretFindings.push({ ...f, ref });
          evidence.push({
            ref,
            kind: "diff_hunk",
            title: `${e.file} lines ${start}–${end}`,
            payload: { kind: "diff_hunk", hunk },
            blobPath: null,
          });
        }
        break;
      }
      case "test":
        evidence.push({
          ref: refs.test(e.name, e.suite),
          kind: "test_case",
          title: e.name,
          payload: {
            kind: "test_case",
            test: {
              name: e.name,
              suite: e.suite ?? null,
              status: e.status,
              durationMs: null,
              message: e.message ? redact(e.message).text : null,
            },
          },
          blobPath: null,
        });
        break;
      case "ci":
        evidence.push({
          ref: refs.ci(e.name),
          kind: "ci_step",
          title: `CI: ${e.name}`,
          payload: {
            kind: "ci_step",
            step: {
              name: e.name,
              conclusion: e.conclusion,
              url: e.url ?? null,
              summary: e.summary ? redact(e.summary).text : null,
            },
          },
          blobPath: null,
        });
        break;
      case "log": {
        const r = redact(e.text);
        for (const f of r.findings) secretFindings.push({ ...f, ref: refs.log(e.source) });
        evidence.push({
          ref: refs.log(e.source),
          kind: "log",
          title: `Log: ${e.source}`,
          payload: { kind: "log", source: e.source, text: r.text },
          blobPath: null,
        });
        break;
      }
      case "decision": {
        decisionIndex += 1;
        const r = redact(`${e.chosen}\n${e.rationale}`);
        for (const f of r.findings)
          secretFindings.push({ ...f, ref: refs.decision(decisionIndex) });
        evidence.push({
          ref: refs.decision(decisionIndex),
          kind: "decision",
          title: `Decision: ${redact(e.title).text}`,
          payload: {
            kind: "decision",
            title: redact(e.title).text,
            chosen: redact(e.chosen).text,
            alternatives: e.alternatives.map((a) => redact(a).text),
            rationale: redact(e.rationale).text,
          },
          blobPath: null,
        });
        break;
      }
      case "artifact":
        artifactIndex += 1;
        evidence.push({
          ref: refs.artifact(artifactIndex),
          kind: "agent_artifact",
          title: e.label,
          payload: { kind: "agent_artifact", artifactType: e.type, url: e.url, label: e.label },
          blobPath: null,
        });
        break;
    }
  }

  const agent = KNOWN_AGENTS.has(report.task.agent as AgentKey)
    ? (report.task.agent as AgentKey)
    : "unknown";
  return {
    secretFindings,
    task: {
      source: "sdk",
      externalId: `sdk:${report.task.repo}:${report.task.id}`,
      repoFullName: report.task.repo,
      prNumber: null,
      prUrl: report.task.url ?? null,
      title: redact(report.task.title).text,
      branch: report.task.branch ?? null,
      baseSha: null,
      headSha: null,
      authorLogin: null,
      agent,
      agentDetection: agent === "unknown" ? `SDK report from "${report.task.agent}"` : "SDK report",
      agentClaim: claim.text,
      labels: [],
      state: "open",
      occurredAt: report.task.occurredAt ?? new Date().toISOString(),
      mergedAt: null,
      mergeCommitSha: null,
      reverts: null,
      additions: files.reduce((n, f) => n + f.additions, 0),
      deletions: files.reduce((n, f) => n + f.deletions, 0),
      files,
      evidence,
    },
  };
}
