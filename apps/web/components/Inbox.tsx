"use client";

import type { Evidence } from "@lumi/core";
import type { Route } from "next";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import type { Health } from "@/lib/data";
import { AGENT_VAR, ago, clock } from "@/lib/format";
import { useKeys } from "@/lib/keys";
import { narrowest } from "@/lib/refs";
import { toneOf, URGENCY } from "@/lib/state";
import { KeyHints } from "./KeyHints";
import { EvidenceItem } from "./review/EvidencePanel";
import { Button } from "./ui/Button";
import { Segmented } from "./ui/Segmented";
import { StateWord } from "./ui/StateWord";

export interface InboxRow {
  id: string;
  prNumber: number | null;
  prUrl: string | null;
  title: string;
  headline: string;
  agent: string;
  agentName: string;
  repo: string;
  area: string;
  health: Health;
  word: string;
  reason: string;
  prState: string;
  durationMs: number | null;
  activityAt: string;
  decided: { kind: string; by: string } | null;
  recommendation: { kind: string; reason: string } | null;
  defects: { severity: string; summary: string; explanation: string; refs: string[] }[];
  evidence: Evidence[];
}

type Bucket = "problem" | "decision" | "working" | "done";
type Range = "since" | "24h" | "7d" | "all";

const BUCKETS: { key: Bucket; label: string; tone: string }[] = [
  { key: "problem", label: "problems", tone: "text-oxide" },
  { key: "decision", label: "need your decision", tone: "text-ochre" },
  { key: "working", label: "with agents or in review", tone: "text-stone" },
  { key: "done", label: "merged, no issues", tone: "text-stone" },
];
const bucketOf = (r: InboxRow): Bucket => toneOf(r.health);
const RECOMMEND: Record<string, string> = {
  approve: "approve",
  request_changes: "request changes",
  reject: "reject",
  needs_discussion: "discuss it",
};

/**
 * The inbox. Answer first (what changed since your last visit and what needs you), then
 * every task in one dense table sorted by urgency, with a preview you can act from.
 * Problems and decisions always show, however old; the range only trims finished work.
 */
export function Inbox({
  rows,
  now,
  since,
  sinceLabel,
}: {
  rows: InboxRow[];
  now: string;
  since: string;
  sinceLabel: string;
}) {
  const router = useRouter();
  const [range, setRange] = useState<Range>("since");
  const [bucket, setBucket] = useState<Bucket | null>(null);
  const [agent, setAgent] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState<string | null>(null);
  const filterRef = useRef<HTMLInputElement>(null);

  const cutoff = useMemo(() => {
    const n = new Date(now).getTime();
    return range === "since"
      ? new Date(since).getTime()
      : range === "24h"
        ? n - 86_400_000
        : range === "7d"
          ? n - 7 * 86_400_000
          : 0;
  }, [range, now, since]);
  const inRange = useMemo(
    () =>
      rows.filter(
        (r) =>
          ["problem", "decision"].includes(bucketOf(r)) ||
          new Date(r.activityAt).getTime() >= cutoff,
      ),
    [rows, cutoff],
  );
  const changed = inRange.filter((r) => new Date(r.activityAt).getTime() >= cutoff);
  const agents = [...new Set(inRange.map((r) => r.agentName))];
  const shown = useMemo(() => {
    const term = q.trim().toLowerCase();
    return inRange
      .filter((r) => !bucket || bucketOf(r) === bucket)
      .filter((r) => !agent || r.agentName === agent)
      .filter(
        (r) =>
          !term ||
          [
            r.headline,
            r.title,
            r.agentName,
            r.area,
            r.repo,
            r.word,
            r.prNumber ? `#${r.prNumber}` : "",
          ]
            .join(" ")
            .toLowerCase()
            .includes(term),
      )
      .sort(
        (a, b) =>
          URGENCY[a.health] - URGENCY[b.health] ||
          new Date(b.activityAt).getTime() - new Date(a.activityAt).getTime(),
      );
  }, [inRange, bucket, agent, q]);

  const [selId, setSelId] = useState<string | null>(shown[0]?.id ?? null);
  useEffect(() => {
    if (!shown.some((r) => r.id === selId)) setSelId(shown[0]?.id ?? null);
  }, [shown, selId]);
  const sel = shown.find((r) => r.id === selId) ?? null;
  const move = (d: number) => {
    const i = shown.findIndex((r) => r.id === selId);
    const next = shown[Math.min(shown.length - 1, Math.max(0, i + d))];
    if (next) {
      setSelId(next.id);
      document.getElementById(`row-${next.id}`)?.scrollIntoView({ block: "nearest" });
    }
  };
  const canApprove = (r: InboxRow | null) =>
    !!r && r.prState === "open" && !r.decided && r.recommendation?.kind === "approve";
  const approve = async (r: InboxRow) => {
    setBusy(r.id);
    try {
      await fetch(`/api/tasks/${r.id}/decide`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ kind: "approve" }),
      });
      router.refresh();
    } finally {
      setBusy(null);
    }
  };
  const toggleBucket = (b: Bucket) => setBucket((x) => (x === b ? null : b));

  useKeys([
    { keys: "j", label: "Next task", run: () => move(1) },
    { keys: "k", label: "Previous task", run: () => move(-1) },
    {
      keys: "Enter",
      label: "Open the review",
      run: () => sel && router.push(`/tasks/${sel.id}` as Route),
    },
    {
      keys: "o",
      label: "Open the PR on GitHub",
      run: () => sel?.prUrl && window.open(sel.prUrl, "_blank", "noopener"),
    },
    {
      keys: "a",
      label: "Approve, when Lumi recommends it",
      run: () => canApprove(sel) && sel && void approve(sel),
    },
    { keys: "1", label: "Show problems", run: () => toggleBucket("problem"), quiet: true },
    { keys: "2", label: "Show decisions", run: () => toggleBucket("decision"), quiet: true },
    { keys: "3", label: "Show work with agents", run: () => toggleBucket("working"), quiet: true },
    { keys: "4", label: "Show merged work", run: () => toggleBucket("done"), quiet: true },
    {
      keys: "Escape",
      label: "Clear filters",
      run: () => {
        setBucket(null);
        setAgent(null);
        setQ("");
      },
      quiet: true,
    },
  ]);

  const count = (b: Bucket) => inRange.filter((r) => bucketOf(r) === b).length;

  return (
    <div className="mx-auto max-w-[1320px] px-4 pb-16 sm:px-6">
      {/* The answer */}
      <div className="flex flex-wrap items-center gap-x-6 gap-y-3 border-b border-rule py-4">
        <p className="text-[15px] text-stone">
          {sinceLabel}:{" "}
          <span className="font-medium text-text">
            {changed.length} change{changed.length === 1 ? "" : "s"}
          </span>{" "}
          by {new Set(changed.map((r) => r.agentName)).size} agent
          {new Set(changed.map((r) => r.agentName)).size === 1 ? "" : "s"}
        </p>
        <fieldset className="flex flex-wrap gap-1.5" aria-label="Filter by what needs you">
          {BUCKETS.map((b, i) => (
            <button
              key={b.key}
              type="button"
              aria-pressed={bucket === b.key}
              onClick={() => toggleBucket(b.key)}
              title={`Press ${i + 1}`}
              className={`inline-flex items-baseline gap-2 border px-2.5 py-1 text-[13px] ${bucket === b.key ? "border-text text-text" : "border-rule text-text-2 hover:border-rule-2"}`}
            >
              <span className={`num text-[15px] font-medium ${b.tone}`}>{count(b.key)}</span>
              {b.label}
            </button>
          ))}
        </fieldset>
        <div className="ml-auto">
          <Segmented<Range>
            label="Time range"
            value={range}
            onChange={setRange}
            options={[
              { value: "since", label: "Since last visit" },
              { value: "24h", label: "24 h" },
              { value: "7d", label: "7 d" },
              { value: "all", label: "All" },
            ]}
          />
        </div>
      </div>

      {/* Agents, as filters */}
      <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-rule py-2.5 text-[13px]">
        <span className="kicker">Agents</span>
        {agents.map((name) => {
          const mine = inRange.filter((r) => r.agentName === name);
          const problems = mine.filter((r) => bucketOf(r) === "problem").length;
          const key = mine[0]?.agent ?? "unknown";
          return (
            <button
              key={name}
              type="button"
              aria-pressed={agent === name}
              onClick={() => setAgent((a) => (a === name ? null : name))}
              className={`inline-flex items-baseline gap-2 ${agent === name ? "underline underline-offset-4" : ""}`}
            >
              <span style={{ color: AGENT_VAR[key] }}>{name}</span>
              <span className="text-dust">
                {mine.length} task{mine.length === 1 ? "" : "s"}
                {problems ? (
                  <span className="text-oxide">
                    {" "}
                    · {problems} problem{problems === 1 ? "" : "s"}
                  </span>
                ) : null}
              </span>
            </button>
          );
        })}
        <label className="ml-auto flex h-7 w-full items-center border border-rule sm:w-72">
          <input
            ref={filterRef}
            data-filter
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Filter by PR, agent, area or words"
            aria-label="Filter tasks"
            className="h-full min-w-0 flex-1 bg-transparent px-2.5 text-[13px] text-text placeholder:text-dust focus:outline-none"
          />
          <kbd className="mr-1.5 border border-rule-2 px-1 font-mono text-[11px] text-stone">/</kbd>
        </label>
      </div>

      <div className="grid gap-0 lg:grid-cols-[minmax(0,1fr)_400px]">
        {/* The table */}
        <div className="min-w-0 lg:border-r lg:border-rule">
          {shown.length === 0 ? (
            <p className="py-10 text-center text-dust">
              Nothing matches. Press <span className="font-mono">Esc</span> to clear the filters.
            </p>
          ) : (
            <>
              <div className="hidden overflow-x-auto sm:block">
                <table className="w-full min-w-[640px] border-collapse text-[13px]">
                  <thead>
                    <tr className="text-left text-[11px] text-dust">
                      {["State", "PR", "What", "Agent", "Area", "Video", "Last activity"].map(
                        (h) => (
                          <th
                            key={h}
                            className="whitespace-nowrap border-b border-rule px-2.5 py-2 font-medium first:pl-0"
                          >
                            {h}
                          </th>
                        ),
                      )}
                    </tr>
                  </thead>
                  <tbody>
                    {shown.map((r) => (
                      <tr
                        key={r.id}
                        id={`row-${r.id}`}
                        onClick={() => setSelId(r.id)}
                        onDoubleClick={() => router.push(`/tasks/${r.id}` as Route)}
                        className={`cursor-pointer border-b border-rule ${r.id === selId ? "bg-raise shadow-[inset_2px_0_0_var(--text)]" : "hover:bg-surface"}`}
                      >
                        <td className="whitespace-nowrap py-2.5 pl-2 pr-2.5">
                          <StateWord word={r.word} tone={toneOf(r.health)} />
                        </td>
                        <td className="whitespace-nowrap px-2.5 font-mono text-[12px] text-stone">
                          {r.prNumber ? `#${r.prNumber}` : "—"}
                        </td>
                        <td className="max-w-0 w-full px-2.5">
                          <Link
                            href={`/tasks/${r.id}` as Route}
                            title={r.headline}
                            className="block truncate text-text hover:underline hover:underline-offset-4"
                            onClick={(e) => e.stopPropagation()}
                          >
                            {r.headline}
                          </Link>
                        </td>
                        <td
                          className="whitespace-nowrap px-2.5"
                          style={{ color: AGENT_VAR[r.agent] }}
                        >
                          {r.agentName}
                        </td>
                        <td className="whitespace-nowrap px-2.5 text-stone">{r.area}</td>
                        <td className="whitespace-nowrap px-2.5 font-mono text-[12px] text-dust">
                          {r.durationMs ? clock(r.durationMs) : "—"}
                        </td>
                        <td className="whitespace-nowrap px-2.5 text-dust">
                          {ago(r.activityAt, now)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <ul className="sm:hidden">
                {shown.map((r) => (
                  <li key={r.id} className="border-b border-rule">
                    <Link href={`/tasks/${r.id}` as Route} className="block py-3">
                      <div className="flex items-baseline gap-2 text-[13px]">
                        <StateWord word={r.word} tone={toneOf(r.health)} />
                        <span className="font-mono text-[12px] text-stone">
                          {r.prNumber ? `#${r.prNumber}` : ""}
                        </span>
                        <span style={{ color: AGENT_VAR[r.agent] }}>{r.agentName}</span>
                        <span className="ml-auto text-dust">{ago(r.activityAt, now)}</span>
                      </div>
                      <div className="mt-1 line-clamp-2 text-[14px] leading-snug text-text">
                        {r.headline}
                      </div>
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          )}
          <div className="mt-4">
            <KeyHints
              hints={[
                ["j k", "move"],
                ["Enter", "review"],
                ["o", "GitHub"],
                ["a", "approve"],
                ["1 2 3 4", "filter"],
                ["/", "search"],
              ]}
            />
          </div>
        </div>

        {/* The selected task, with actions */}
        {sel && (
          <Preview
            row={sel}
            now={now}
            busy={busy === sel.id}
            canApprove={canApprove(sel)}
            onApprove={() => approve(sel)}
          />
        )}
      </div>
    </div>
  );
}

function Preview({
  row: r,
  now,
  busy,
  canApprove,
  onApprove,
}: {
  row: InboxRow;
  now: string;
  busy: boolean;
  canApprove: boolean;
  onApprove: () => void;
}) {
  return (
    <aside className="hidden min-w-0 lg:block" aria-live="polite">
      <div className="sticky top-0 px-5 py-4">
        <div className="flex items-baseline justify-between gap-3">
          <StateWord word={r.word} tone={toneOf(r.health)} />
          <span className="text-dust">{r.reason !== r.word ? r.reason : ""}</span>
        </div>
        <h2 className="mt-2 text-[17px] font-semibold leading-snug text-text">{r.headline}</h2>
        <div className="mt-1.5 text-[13px] text-dust">
          <span style={{ color: AGENT_VAR[r.agent] }}>{r.agentName}</span>
          {r.prNumber && (
            <>
              {" · "}
              {r.prUrl ? (
                <a
                  href={r.prUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="font-mono hover:text-text"
                >
                  #{r.prNumber} ↗
                </a>
              ) : (
                <span className="font-mono">#{r.prNumber}</span>
              )}
            </>
          )}
          {" · "}
          {r.area} · {ago(r.activityAt, now)}
        </div>

        {r.recommendation && (
          <p className="mt-3 border-t border-rule pt-3 text-[13.5px] text-text-2">
            {r.decided ? (
              <span className="text-stone">
                Decided: {r.decided.kind.replace("_", " ")} by @{r.decided.by}.{" "}
              </span>
            ) : null}
            Lumi recommends{" "}
            <span className="font-medium text-text">
              {RECOMMEND[r.recommendation.kind] ?? r.recommendation.kind}
            </span>
            : {r.recommendation.reason}
          </p>
        )}

        <div className="mt-3 flex flex-wrap gap-2">
          <Link href={`/tasks/${r.id}` as Route}>
            <Button tone="primary" hint="↵">
              Review
            </Button>
          </Link>
          {canApprove && (
            <Button onClick={onApprove} disabled={busy} hint="a">
              {busy ? "Approving…" : "Approve"}
            </Button>
          )}
          {r.prUrl && (
            <a href={r.prUrl} target="_blank" rel="noreferrer">
              <Button hint="o">GitHub</Button>
            </a>
          )}
        </div>

        {r.defects.length > 0 ? (
          <section className="mt-5">
            <div className="kicker">Findings</div>
            {r.defects.map((d) => (
              <div key={d.summary} className="mt-2 border-t border-rule pt-2.5">
                <div className="flex gap-2 text-[13.5px]">
                  <span
                    className={
                      d.severity === "high" ? "font-medium text-oxide" : "font-medium text-ochre"
                    }
                  >
                    {d.severity === "high" ? "High" : "Medium"}
                  </span>
                  <span className="text-text">{d.summary}</span>
                </div>
                {narrowest(d.refs) && r.evidence.length > 0 && (
                  <div className="mt-1 max-h-80 overflow-auto">
                    <EvidenceItem citedRef={narrowest(d.refs)!} evidence={r.evidence} />
                  </div>
                )}
              </div>
            ))}
          </section>
        ) : (
          <p className="mt-5 border-t border-rule pt-3 text-[13.5px] text-stone">
            No problems found.
          </p>
        )}
      </div>
    </aside>
  );
}
