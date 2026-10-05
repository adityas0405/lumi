"use client";

import { useState } from "react";
import { RefChips } from "./TaskReview";

export interface QA {
  id: string;
  question: string;
  answer: { text: string; refs: string[] }[] | null;
  notInEvidence: boolean;
  by: string;
}

/** Pause, ask, and get an answer grounded only in the evidence behind `endpoint`. */
export function AskPanel({
  endpoint,
  initial,
  watching,
  videoTimeMs,
  onShowRefs,
  beforeAsk,
  label = "Ask about this change. Answers come only from its evidence.",
  placeholder = "Why did it change the rounding?",
  renderRefs,
  extra,
}: {
  endpoint: string;
  initial: QA[];
  watching?: string;
  videoTimeMs: number;
  onShowRefs: (refs: string[]) => void;
  beforeAsk: () => void;
  label?: string;
  placeholder?: string;
  /** Replaces the evidence chips, e.g. with links to the tasks a digest answer cites. */
  renderRefs?: (refs: string[]) => React.ReactNode;
  /** More fields for the request body, e.g. the digest item playing. */
  extra?: Record<string, unknown>;
}) {
  const [items, setItems] = useState<QA[]>(initial);
  const [question, setQuestion] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function ask(e: React.FormEvent) {
    e.preventDefault();
    if (!question.trim() || busy) return;
    beforeAsk();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ ...extra, question, videoTimeMs, watching }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Couldn't answer that.");
      setItems((xs) => [...xs, body as QA]);
      setQuestion("");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="py-4">
      <form onSubmit={ask}>
        <label htmlFor={`ask-${endpoint}`} className="text-sm text-stone">
          {label}
        </label>
        <textarea
          id={`ask-${endpoint}`}
          value={question}
          onChange={(e) => setQuestion(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) void ask(e);
          }}
          rows={2}
          placeholder={placeholder}
          className="mt-3 w-full resize-none border border-rule bg-transparent px-3 py-2 text-[15px] placeholder:text-dust focus:border-stone focus:outline-none"
        />
        <div className="mt-2 flex items-center justify-between">
          <span className="text-xs text-dust">
            {busy ? "Reading the evidence…" : "Enter to ask"}
          </span>
          <button
            type="submit"
            disabled={busy || !question.trim()}
            className="border border-text px-4 py-1.5 text-sm disabled:opacity-40 hover:bg-text hover:text-bg"
          >
            Ask
          </button>
        </div>
        {error && <p className="mt-2 text-sm text-oxide">{error}</p>}
      </form>

      <div className="mt-6">
        {items
          .slice()
          .reverse()
          .map((q) => (
            <div key={q.id} className="border-t border-rule py-4">
              <div className="text-sm text-stone">
                {q.question} <span className="text-xs text-dust">· @{q.by}</span>
              </div>
              {q.notInEvidence && (
                <div className="kicker mt-3 !text-ochre">Not in the evidence</div>
              )}
              <div className="mt-2 space-y-2">
                {(q.answer ?? []).map((a) => (
                  <div key={a.text}>
                    <p className="font-medium text-[15px] leading-snug text-text">{a.text}</p>
                    {renderRefs ? (
                      renderRefs(a.refs)
                    ) : (
                      <RefChips refs={a.refs} onPick={onShowRefs} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
      </div>
    </div>
  );
}
