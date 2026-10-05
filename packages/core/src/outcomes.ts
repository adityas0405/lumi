/** What a pull request says it reverts: merge commits and pull request numbers. */
export interface RevertLinks {
  shas: string[];
  prNumbers: number[];
}

const COMMIT_RE = /This reverts commit ([0-9a-f]{7,40})/gi;
// GitHub's Revert button: "Reverts owner/repo#12".
const GITHUB_BODY_RE = /^Reverts [\w.-]+\/[\w.-]+#(\d+)/gim;
// Lumi's rollback: "Rolls back #12, the suspected cause…".
const LUMI_BODY_RE = /\bRolls back #(\d+)/gi;

/**
 * Finds what a pull request reverts, from `git revert` commit messages and the
 * bodies GitHub's Revert button and Lumi's rollback write. A "Revert …" title
 * alone isn't enough: without a link there's nothing to attach the outcome to.
 */
export function detectRevert(input: {
  title: string;
  body: string;
  commitMessages: string[];
}): RevertLinks | null {
  const shas = new Set<string>();
  const prNumbers = new Set<number>();
  for (const m of input.commitMessages) {
    for (const [, sha] of m.matchAll(COMMIT_RE)) shas.add(sha!.toLowerCase());
  }
  for (const re of [GITHUB_BODY_RE, LUMI_BODY_RE]) {
    for (const [, n] of input.body.matchAll(re)) prNumbers.add(Number(n));
  }
  if (!shas.size && !prNumbers.size) return null;
  return { shas: [...shas], prNumbers: [...prNumbers] };
}

/** Which side an open change is waiting on, if it has stalled. */
export type HeldUpSide = "reviewer" | "agent";

/**
 * A change is held up when it has waited `days` for the reviewer's decision, or
 * `days` since changes were requested with no new commits from the agent.
 */
export function heldUpSide(input: {
  now: Date;
  days: number;
  /** When the change was first ready for review. */
  readySince: Date;
  latestDecision: { kind: string; at: Date } | null;
  /** When the agent last pushed new commits. */
  headChangedAt: Date | null;
}): HeldUpSide | null {
  const limit = input.days * 86_400_000;
  const waited = (since: Date) => input.now.getTime() - since.getTime() >= limit;
  const d = input.latestDecision;
  if (!d) return waited(input.readySince) ? "reviewer" : null;
  if (d.kind !== "request_changes") return null;
  const pushedSince = input.headChangedAt !== null && input.headChangedAt > d.at;
  return !pushedSince && waited(d.at) ? "agent" : null;
}
