import {
  buildModuleMap,
  detectAgent,
  detectRevert,
  type Evidence,
  type FileChange,
  hunkRange,
  isGeneratedFile,
  isSecretFile,
  isTestFile,
  type NormalizedTask,
  parsePatch,
  redact,
  redactLines,
  refs,
  type SecretFinding,
} from "@lumi/core";
import type { Octokit } from "octokit";
import { type CiSnapshot, fetchCi } from "./ci";
import { fetchContext, type RawContext } from "./context";

/** Everything Lumi reads about a pull request, before normalization. */
export interface RawPullRequest {
  repoFullName: string;
  pr: {
    number: number;
    html_url: string;
    title: string;
    body: string | null;
    state: "open" | "closed";
    merged_at: string | null;
    merge_commit_sha: string | null;
    created_at: string;
    user: { login: string } | null;
    head: { ref: string; sha: string };
    base: { ref: string; sha: string };
    labels: { name?: string }[];
  };
  files: {
    filename: string;
    previous_filename?: string;
    status: string;
    additions: number;
    deletions: number;
    patch?: string;
  }[];
  commits: { message: string; authorDate: string | null; committerDate: string | null }[];
  ci: CiSnapshot;
  context?: RawContext;
}

export interface NormalizeResult {
  task: NormalizedTask;
  secretFindings: (SecretFinding & { ref: string })[];
  ciPending: boolean;
}

const FILE_STATUSES = new Set([
  "added",
  "modified",
  "removed",
  "renamed",
  "copied",
  "changed",
  "unchanged",
]);

/** Pure: turns raw GitHub data into a task with redacted evidence. */
export function normalizePullRequest(raw: RawPullRequest): NormalizeResult {
  const { pr } = raw;
  const evidence: Evidence[] = [];
  const secretFindings: NormalizeResult["secretFindings"] = [];
  const files: FileChange[] = [];

  const claim = redact(pr.body ?? "");
  for (const f of claim.findings) secretFindings.push({ ...f, ref: refs.claim() });
  evidence.push({
    ref: refs.claim(),
    kind: "agent_claim",
    title: "What the agent said about this change",
    payload: { kind: "agent_claim", text: claim.text },
    blobPath: null,
  });

  for (const f of raw.files) {
    let withheldReason: string | null = null;
    if (isSecretFile(f.filename)) withheldReason = "secrets file: contents never read";
    else if (isGeneratedFile(f.filename)) withheldReason = "generated file";
    else if (f.patch === undefined) withheldReason = "binary or too large to diff";

    const file: FileChange = {
      path: f.filename,
      previousPath: f.previous_filename ?? null,
      status: (FILE_STATUSES.has(f.status) ? f.status : "changed") as FileChange["status"],
      additions: f.additions,
      deletions: f.deletions,
      binary: f.patch === undefined && f.additions + f.deletions === 0,
      withheld: withheldReason !== null,
      withheldReason,
    };
    files.push(file);
    evidence.push({
      ref: refs.file(f.filename),
      kind: "file",
      title: f.filename,
      payload: { kind: "file", file },
      blobPath: null,
    });
    if (isSecretFile(f.filename)) {
      secretFindings.push({
        kind: "secrets-file",
        preview: f.filename,
        ref: refs.file(f.filename),
      });
    }
    if (withheldReason || !f.patch) continue;

    for (const hunk of parsePatch(f.filename, f.patch)) {
      const r = redactLines(hunk.lines.map((l) => l.text));
      hunk.lines = hunk.lines.map((l, i) => ({ ...l, text: r.lines[i]! }));
      const { start, end } = hunkRange(hunk);
      const ref = refs.diff(f.filename, start, end);
      for (const finding of r.findings) secretFindings.push({ ...finding, ref });
      evidence.push({
        ref,
        kind: "diff_hunk",
        title: `${f.filename} lines ${start}–${end}`,
        payload: { kind: "diff_hunk", hunk },
        blobPath: null,
      });
    }
  }

  for (const step of raw.ci.steps) {
    const ref = refs.ci(step.name);
    if (evidence.some((e) => e.ref === ref)) continue;
    evidence.push({
      ref,
      kind: "ci_step",
      title: `CI: ${step.name}`,
      payload: {
        kind: "ci_step",
        step: { ...step, summary: step.summary ? redact(step.summary).text : null },
      },
      blobPath: null,
    });
  }

  // Tests from changed test files, plus every failing or skipped test anywhere.
  const changedTestFiles = new Set(files.filter((f) => isTestFile(f.path)).map((f) => f.path));
  const seen = new Set<string>();
  for (const t of raw.ci.tests) {
    const inChangedFile = t.suite !== null && changedTestFiles.has(t.suite);
    if (!inChangedFile && t.status === "passed") continue;
    let ref = refs.test(t.name);
    if (seen.has(ref)) ref = refs.test(t.name, t.suite);
    if (seen.has(ref)) continue;
    seen.add(ref);
    evidence.push({
      ref,
      kind: "test_case",
      title: `${t.status === "passed" ? "✓" : t.status === "failed" ? "✗" : "○"} ${t.name}`,
      payload: {
        kind: "test_case",
        test: { ...t, message: t.message ? redact(t.message).text : null },
      },
      blobPath: null,
    });
  }
  if (raw.ci.tests.length > 0) {
    const count = (s: string) => raw.ci.tests.filter((t) => t.status === s).length;
    const summary = `${count("passed")} passed, ${count("failed")} failed, ${count("skipped")} skipped`;
    evidence.push({
      ref: refs.ci("tests"),
      kind: "ci_step",
      title: `Test run: ${summary}`,
      payload: {
        kind: "ci_step",
        step: {
          name: "tests",
          conclusion: count("failed") > 0 ? "failure" : "success",
          url: null,
          summary,
        },
      },
      blobPath: null,
    });
  }

  if (raw.context) evidence.push(...contextEvidence(raw, secretFindings));

  const labels = pr.labels.map((l) => l.name ?? "").filter(Boolean);
  const detection = detectAgent({
    authorLogin: pr.user?.login ?? null,
    branch: pr.head.ref,
    labels,
    commitMessages: raw.commits.map((c) => c.message),
    body: pr.body ?? "",
  });

  const reverts = detectRevert({
    title: pr.title,
    body: pr.body ?? "",
    commitMessages: raw.commits.map((c) => c.message),
  });

  const commitDates = raw.commits
    .map((c) => c.authorDate ?? c.committerDate)
    .filter((d): d is string => Boolean(d))
    .sort();

  const task: NormalizedTask = {
    source: "github",
    externalId: `github:${raw.repoFullName}#${pr.number}`,
    repoFullName: raw.repoFullName,
    prNumber: pr.number,
    prUrl: pr.html_url,
    title: redact(pr.title).text,
    branch: pr.head.ref,
    baseSha: pr.base.sha,
    headSha: pr.head.sha,
    authorLogin: pr.user?.login ?? null,
    agent: detection.agent,
    agentDetection: detection.via,
    agentClaim: claim.text,
    labels,
    state: pr.merged_at ? "merged" : pr.state,
    // When the agent started the work: its first commit, falling back to PR creation.
    occurredAt: commitDates[0] ?? pr.created_at,
    mergedAt: pr.merged_at,
    mergeCommitSha: pr.merge_commit_sha,
    reverts,
    additions: files.reduce((n, f) => n + f.additions, 0),
    deletions: files.reduce((n, f) => n + f.deletions, 0),
    files,
    evidence,
  };
  return { task, secretFindings, ciPending: raw.ci.pending };
}

/** Fetches everything needed to normalize one pull request. */
export async function fetchPullRequest(
  octokit: Octokit,
  repoFullName: string,
  number: number,
): Promise<RawPullRequest> {
  const [owner, repo] = repoFullName.split("/") as [string, string];
  const { data: pr } = await octokit.rest.pulls.get({ owner, repo, pull_number: number });
  const [files, commits, ci] = await Promise.all([
    octokit.paginate(octokit.rest.pulls.listFiles, {
      owner,
      repo,
      pull_number: number,
      per_page: 100,
    }),
    octokit.paginate(octokit.rest.pulls.listCommits, {
      owner,
      repo,
      pull_number: number,
      per_page: 100,
    }),
    fetchCi(octokit, owner, repo, pr.head.sha),
  ]);
  return {
    repoFullName,
    pr: pr as unknown as RawPullRequest["pr"],
    files,
    commits: commits.map((c) => ({
      message: c.commit.message,
      authorDate: c.commit.author?.date ?? null,
      committerDate: c.commit.committer?.date ?? null,
    })),
    ci,
    context: await fetchContext(
      octokit,
      repoFullName,
      number,
      pr.base.sha,
      pr.head.sha,
      files.map((f) => f.filename),
    ),
  };
}

const WHOLE_FILE_MAX = 220;
const WINDOW_PAD = 25;

/** Orientation evidence: the task, the README, surrounding code and the module map. */
function contextEvidence(
  raw: RawPullRequest,
  secretFindings: NormalizeResult["secretFindings"],
): Evidence[] {
  const ctx = raw.context!;
  const out: Evidence[] = [];
  for (const issue of ctx.issues) {
    const body = redact(issue.body ?? "");
    for (const f of body.findings) secretFindings.push({ ...f, ref: refs.task(issue.number) });
    out.push({
      ref: refs.task(issue.number),
      kind: "task",
      title: `Issue #${issue.number}: ${issue.title}`,
      payload: {
        kind: "task",
        source: `GitHub issue #${issue.number}`,
        title: redact(issue.title).text,
        body: body.text.slice(0, 6000),
        url: issue.url,
        requestedBy: issue.author ?? null,
        requestedByName: issue.authorName ?? null,
      },
      blobPath: null,
    });
  }
  if (ctx.readme) {
    out.push({
      ref: refs.doc(ctx.readme.path),
      kind: "doc",
      title: ctx.readme.path,
      payload: {
        kind: "doc",
        path: ctx.readme.path,
        text: redact(ctx.readme.text).text.slice(0, 6000),
      },
      blobPath: null,
    });
  }
  for (const file of ctx.baseFiles) {
    const all = file.content.replace(/\n$/, "").split("\n");
    const { lines } = redactLines(all);
    const windows: [number, number][] = [];
    if (lines.length <= WHOLE_FILE_MAX) windows.push([1, lines.length]);
    else {
      const patch = raw.files.find((f) => f.filename === file.path)?.patch ?? "";
      for (const h of parsePatch(file.path, patch)) {
        const start = Math.max(1, h.oldStart - WINDOW_PAD);
        const end = Math.min(lines.length, h.oldStart + h.oldLines + WINDOW_PAD);
        const last = windows.at(-1);
        if (last && start <= last[1] + 1) last[1] = Math.max(last[1], end);
        else windows.push([start, end]);
      }
    }
    for (const [start, end] of windows) {
      out.push({
        ref: refs.code(file.path, start, end),
        kind: "code",
        title: `${file.path} before the change (lines ${start}–${end})`,
        payload: {
          kind: "code",
          path: file.path,
          startLine: start,
          lines: lines.slice(start - 1, end),
        },
        blobPath: null,
      });
    }
  }
  if (ctx.sourceFiles.length) {
    const changed = new Map(raw.files.map((f) => [f.filename, f.additions + f.deletions]));
    const map = buildModuleMap(ctx.sourceFiles, changed);
    if (map.modules.length >= 2) {
      out.push({
        ref: refs.map(),
        kind: "module_map",
        title: `Module map: ${map.modules.length} modules around the change`,
        payload: { kind: "module_map", modules: map.modules, edges: map.edges },
        blobPath: null,
      });
    }
  }
  return out;
}
