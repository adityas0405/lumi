"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function IncidentActions({
  incidentId,
  agent,
  agentName,
  agentPaused,
  canRollback,
  resolved,
}: {
  incidentId: string;
  agent: string | null;
  agentName: string | null;
  agentPaused: boolean;
  canRollback: boolean;
  resolved: boolean;
}) {
  const router = useRouter();
  const [busy, setBusy] = useState<string | null>(null);
  const [message, setMessage] = useState<{ text: string; url?: string; error?: boolean } | null>(
    null,
  );

  async function act(kind: "rollback" | "pause" | "resolve") {
    setBusy(kind);
    setMessage(null);
    const t0 = Date.now();
    const r = await fetch(`/api/incidents/${incidentId}/${kind}`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(kind === "pause" ? { agent } : {}),
    });
    const body = await r.json().catch(() => ({}));
    setBusy(null);
    if (!r.ok) {
      setMessage({ text: body.error ?? "That didn't work.", error: true });
      return;
    }
    const secs = ((Date.now() - t0) / 1000).toFixed(1);
    if (kind === "rollback")
      setMessage({
        text: body.url ? `Revert pull request opened in ${secs} s.` : "Rollback triggered.",
        url: body.url ?? undefined,
      });
    if (kind === "pause")
      setMessage({
        text: `${agentName} paused. ${body.openPrs} open pull request${body.openPrs === 1 ? "" : "s"} labelled.`,
      });
    router.refresh();
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2">
        {canRollback && (
          <button
            type="button"
            disabled={Boolean(busy) || resolved}
            onClick={() => act("rollback")}
            className="border border-oxide bg-oxide px-4 py-2 text-sm text-bg disabled:opacity-40"
          >
            {busy === "rollback" ? "Opening the revert…" : "Roll back"}
          </button>
        )}
        {agent && (
          <button
            type="button"
            disabled={Boolean(busy) || agentPaused}
            onClick={() => act("pause")}
            className="border border-rule px-4 py-2 text-sm hover:border-text disabled:opacity-40"
          >
            {agentPaused
              ? `${agentName} is paused`
              : busy === "pause"
                ? "Pausing…"
                : `Pause ${agentName}`}
          </button>
        )}
        <button
          type="button"
          disabled={Boolean(busy) || resolved}
          onClick={() => act("resolve")}
          className="px-4 py-2 text-sm text-stone hover:text-text disabled:opacity-40"
        >
          {resolved ? "Resolved" : "Mark resolved"}
        </button>
      </div>
      {message && (
        <p className={`mt-3 text-sm ${message.error ? "text-oxide" : "text-text-2"}`}>
          {message.text}{" "}
          {message.url && (
            <a
              href={message.url}
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-4"
            >
              View it on GitHub
            </a>
          )}
        </p>
      )}
    </div>
  );
}
