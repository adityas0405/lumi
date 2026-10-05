"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ago } from "@/lib/format";
import { useKeys } from "@/lib/keys";
import { Button } from "../ui/Button";

export interface PastDecision {
  kind: string;
  feedback: string | null;
  by: string;
  at: string;
  deliveredAt: string | null;
  deliveryError: string | null;
}

type Kind = "approve" | "request_changes" | "reject";

const LABEL: Record<Kind, string> = {
  approve: "Approve",
  request_changes: "Request changes",
  reject: "Reject",
};

/** The decision, delivered to the agent's workflow as a GitHub review. */
export function DecidePanel({
  taskId,
  prNumber,
  past,
  recommendation,
  now,
  open = true,
}: {
  taskId: string;
  prNumber: number | null;
  past: PastDecision[];
  recommendation: { recommendation: string; reason: string } | null;
  /** Server render time, for relative times that match on server and client. */
  now: string;
  /** False once the PR is merged or closed: there is nothing left to decide. */
  open?: boolean;
}) {
  const router = useRouter();
  const [kind, setKind] = useState<Kind | null>(null);
  const [feedback, setFeedback] = useState("");
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{
    reviewUrl: string | null;
    deliveryError: string | null;
    kind: Kind;
    ms: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const feedbackRef = useRef<HTMLTextAreaElement>(null);
  // Approving against Lumi's advice takes a second press.
  const [confirmApprove, setConfirmApprove] = useState(false);
  const advisesApprove = !recommendation || recommendation.recommendation === "approve";
  const pick = (k: Kind) => {
    if (k === "approve") {
      if (advisesApprove || confirmApprove) void submit("approve");
      else setConfirmApprove(true);
      return;
    }
    setConfirmApprove(false);
    // Start from Lumi's reason when it asked for the same thing; the reviewer edits it.
    if (
      k === "request_changes" &&
      !feedback &&
      recommendation?.recommendation === "request_changes"
    )
      setFeedback(recommendation.reason);
    setKind(kind === k ? null : k);
  };
  useKeys(
    open
      ? [
          { keys: "a", label: "Approve", run: () => pick("approve") },
          { keys: "r", label: "Request changes", run: () => pick("request_changes") },
          { keys: "x", label: "Reject", run: () => pick("reject") },
        ]
      : [],
  );
  // Move focus to the feedback box when a decision that needs words is picked.
  useEffect(() => {
    if (kind) feedbackRef.current?.focus();
  }, [kind]);

  async function submit(k: Kind) {
    if (k !== "approve" && feedback.trim().length < 3) {
      setKind(k);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/tasks/${taskId}/decide`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: k, feedback: feedback.trim() || undefined }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't record the decision.");
      setResult({
        reviewUrl: body.reviewUrl,
        deliveryError: body.deliveryError,
        kind: k,
        ms: body.deliveredMs,
      });
      setKind(null);
      setFeedback("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="border-b border-rule py-4" aria-label="Decision">
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        {recommendation ? (
          <p className="min-w-0 max-w-3xl text-[14px] leading-relaxed text-text-2">
            Lumi recommends{" "}
            <span className="font-medium text-text">
              {recommendation.recommendation.replace("_", " ")}
            </span>
            : {recommendation.reason}
          </p>
        ) : (
          <p className="text-[14px] text-stone">Lumi hasn't made a recommendation yet.</p>
        )}
        {!open && (
          <p className="shrink-0 text-[13px] text-dust">
            Merged or closed: nothing left to decide here.
          </p>
        )}
        <div className={`flex shrink-0 gap-2 ${open ? "" : "hidden"}`}>
          {(["approve", "request_changes", "reject"] as const).map((k) => (
            <Button
              key={k}
              disabled={busy}
              onClick={() => pick(k)}
              hint={{ approve: "a", request_changes: "r", reject: "x" }[k]}
              tone={kind === k || (k === "approve" && confirmApprove) ? "primary" : "secondary"}
            >
              {k === "approve" && confirmApprove ? "Approve anyway" : LABEL[k]}
            </Button>
          ))}
        </div>
      </div>
      {confirmApprove && (
        <p className="mt-2 text-[13px] text-ochre">
          Lumi recommends {recommendation?.recommendation.replace("_", " ")}. Press{" "}
          <span className="font-mono">a</span> again to approve anyway.
        </p>
      )}

      {kind && (
        <form
          className="mt-5"
          onSubmit={(e) => {
            e.preventDefault();
            void submit(kind);
          }}
        >
          <label htmlFor="feedback" className="text-[13px] text-stone">
            {kind === "request_changes"
              ? "What should the agent change?"
              : "Why are you rejecting this?"}{" "}
            This is posted to the pull request.
          </label>
          <textarea
            id="feedback"
            ref={feedbackRef}
            rows={3}
            value={feedback}
            onChange={(e) => setFeedback(e.target.value)}
            placeholder={
              kind === "request_changes"
                ? "Restore the strict comparison and re-enable the skipped test."
                : ""
            }
            className="mt-3 w-full resize-y border border-rule bg-transparent px-3 py-2 text-[15px] placeholder:text-dust focus:border-stone focus:outline-none"
          />
          <div className="mt-3 flex items-center gap-4">
            <button
              type="submit"
              disabled={busy || feedback.trim().length < 3}
              className="border border-text bg-text px-4 py-2 text-sm text-bg disabled:opacity-40"
            >
              {busy ? "Posting…" : `${LABEL[kind]}${prNumber ? ` on PR #${prNumber}` : ""}`}
            </button>
            <button
              type="button"
              onClick={() => setKind(null)}
              className="text-sm text-stone hover:text-text"
            >
              Cancel
            </button>
          </div>
        </form>
      )}

      {error && <p className="mt-4 text-sm text-oxide">{error}</p>}
      {result && (
        <p className="mt-4 text-sm text-text-2">
          {LABEL[result.kind]} recorded.{" "}
          {result.reviewUrl ? (
            <>
              Posted to GitHub in {(result.ms / 1000).toFixed(1)} s ·{" "}
              <a
                href={result.reviewUrl}
                target="_blank"
                rel="noreferrer"
                className="underline underline-offset-4"
              >
                view the review
              </a>
            </>
          ) : result.deliveryError ? (
            <span className="text-oxide">Couldn't post to GitHub: {result.deliveryError}</span>
          ) : null}
        </p>
      )}

      {past.length > 0 && (
        <ul className="mt-3 text-[13px]">
          {past.map((d) => (
            <li
              key={`${d.at}${d.kind}`}
              className="flex flex-wrap gap-x-3 border-t border-rule py-2 text-stone"
            >
              <span className="text-text">{LABEL[d.kind as Kind] ?? d.kind}</span>
              <span>by @{d.by}</span>
              <span className="text-dust">{ago(d.at, now)}</span>
              {d.deliveryError ? (
                <span className="text-oxide">not delivered</span>
              ) : d.deliveredAt ? (
                <span className="text-dust">on GitHub</span>
              ) : null}
              {d.feedback && <span className="basis-full text-text-2">{d.feedback}</span>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
