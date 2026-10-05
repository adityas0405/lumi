import type { Octokit } from "octokit";

export type DecisionKind = "approve" | "request_changes" | "reject";

const EVENTS: Record<DecisionKind, "APPROVE" | "REQUEST_CHANGES" | "COMMENT"> = {
  approve: "APPROVE",
  request_changes: "REQUEST_CHANGES",
  reject: "COMMENT",
};

const HEADINGS: Record<DecisionKind, string> = {
  approve: "Approved",
  request_changes: "Changes requested",
  reject: "Rejected",
};

/** The review text: who decided, their words, and a mention the coding agent listens for. */
export function reviewBody(input: {
  kind: DecisionKind;
  decidedBy: string;
  feedback: string | null;
  mention: string | null;
  lumiUrl: string | null;
}): string {
  const lines = [`**${HEADINGS[input.kind]}** in Lumi by @${input.decidedBy}.`];
  if (input.feedback?.trim()) lines.push("", input.feedback.trim());
  if (input.mention && input.kind !== "approve")
    lines.push("", `${input.mention} please address the feedback above.`);
  if (input.lumiUrl) lines.push("", `<sub>Reviewed with [Lumi](${input.lumiUrl}).</sub>`);
  return lines.join("\n");
}

/** Posts a decision as a pull request review; a rejection can also close the PR. */
export async function postReview(
  octokit: Octokit,
  repoFullName: string,
  prNumber: number,
  kind: DecisionKind,
  body: string,
  opts: { closeOnReject?: boolean } = {},
): Promise<{ reviewId: number; url: string }> {
  const [owner, repo] = repoFullName.split("/") as [string, string];
  const { data } = await octokit.rest.pulls.createReview({
    owner,
    repo,
    pull_number: prNumber,
    event: EVENTS[kind],
    body,
  });
  if (kind === "reject" && opts.closeOnReject) {
    await octokit.rest.pulls.update({ owner, repo, pull_number: prNumber, state: "closed" });
  }
  return { reviewId: data.id, url: data.html_url };
}
