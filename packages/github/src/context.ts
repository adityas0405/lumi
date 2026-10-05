import { isGeneratedFile, isSecretFile, isTestFile } from "@lumi/core";
import type { Octokit } from "octokit";

export interface RawContext {
  /** Issues the PR says it closes: what the agent was asked to do, and who asked. */
  issues: {
    number: number;
    title: string;
    body: string;
    url: string;
    author?: string | null;
    authorName?: string | null;
  }[];
  readme: { path: string; text: string } | null;
  /** Touched source files at the base commit, for surrounding code. */
  baseFiles: { path: string; content: string }[];
  /** Source files at the head commit, for the module map. */
  sourceFiles: { path: string; content: string }[];
}

const SOURCE_RE = /\.(tsx?|jsx?|mjs|cjs|py|go|rb)$/;
const MAX_SOURCE_FILES = 150;
const MAX_FILE_BYTES = 200_000;

async function fileAt(
  octokit: Octokit,
  owner: string,
  repo: string,
  path: string,
  ref: string,
): Promise<string | null> {
  try {
    const { data } = await octokit.rest.repos.getContent({ owner, repo, path, ref });
    if (Array.isArray(data) || data.type !== "file" || !("content" in data)) return null;
    if ((data.size ?? 0) > MAX_FILE_BYTES) return null;
    return Buffer.from(data.content, "base64").toString("utf8");
  } catch {
    return null;
  }
}

async function mapLimit<T, R>(items: T[], limit: number, fn: (t: T) => Promise<R>): Promise<R[]> {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(limit, items.length) }, async () => {
      while (i < items.length) {
        const n = i++;
        out[n] = await fn(items[n]!);
      }
    }),
  );
  return out;
}

/**
 * Everything a reviewer needs to get oriented before reading the diff: the task,
 * the project's own description, the code around the change and how modules
 * connect. Secrets files are never read.
 */
export async function fetchContext(
  octokit: Octokit,
  repoFullName: string,
  prNumber: number,
  baseSha: string,
  headSha: string,
  changedPaths: string[],
): Promise<RawContext> {
  const [owner, repo] = repoFullName.split("/") as [string, string];

  const issues: RawContext["issues"] = [];
  try {
    const q = await octokit.graphql<{
      repository: {
        pullRequest: {
          closingIssuesReferences: {
            nodes: {
              number: number;
              title: string;
              body: string;
              url: string;
              author: { login: string; name?: string | null } | null;
            }[];
          };
        };
      };
    }>(
      `query($owner: String!, $repo: String!, $number: Int!) {
        repository(owner: $owner, name: $repo) {
          pullRequest(number: $number) {
            closingIssuesReferences(first: 5) { nodes { number title body url author { login ... on User { name } } } }
          }
        }
      }`,
      { owner, repo, number: prNumber },
    );
    for (const n of q.repository.pullRequest.closingIssuesReferences.nodes)
      issues.push({ ...n, author: n.author?.login ?? null, authorName: n.author?.name || null });
  } catch {
    // No linked issues or GraphQL unavailable: context falls back to the PR itself.
  }

  let readme: RawContext["readme"] = null;
  try {
    const { data } = await octokit.rest.repos.getReadme({ owner, repo, ref: baseSha });
    readme = { path: data.path, text: Buffer.from(data.content, "base64").toString("utf8") };
  } catch {}

  const touched = changedPaths
    .filter((p) => SOURCE_RE.test(p) && !isTestFile(p) && !isGeneratedFile(p) && !isSecretFile(p))
    .slice(0, 6);
  const baseFiles = (
    await mapLimit(touched, 4, async (path) => {
      const content = await fileAt(octokit, owner, repo, path, baseSha);
      return content === null ? null : { path, content };
    })
  ).filter((f): f is { path: string; content: string } => f !== null);

  let sourceFiles: RawContext["sourceFiles"] = [];
  try {
    const { data: tree } = await octokit.rest.git.getTree({
      owner,
      repo,
      tree_sha: headSha,
      recursive: "true",
    });
    const paths = tree.tree
      .filter(
        (t) =>
          t.type === "blob" &&
          t.path &&
          SOURCE_RE.test(t.path) &&
          !isGeneratedFile(t.path) &&
          !isSecretFile(t.path) &&
          (t.size ?? 0) <= MAX_FILE_BYTES,
      )
      .map((t) => t.path!)
      .slice(0, MAX_SOURCE_FILES);
    sourceFiles = (
      await mapLimit(paths, 8, async (path) => {
        const content = await fileAt(octokit, owner, repo, path, headSha);
        return content === null ? null : { path, content };
      })
    ).filter((f): f is { path: string; content: string } => f !== null);
  } catch {}

  return { issues, readme, baseFiles, sourceFiles };
}
