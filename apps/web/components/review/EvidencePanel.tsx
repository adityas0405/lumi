"use client";

import type { Evidence } from "@lumi/core";
import { parseRef } from "@lumi/core";
import { useState } from "react";

/** Finds the evidence a ref points at, including narrower line ranges inside a hunk or code window. */
export function findEvidence(ref: string, evidence: Evidence[]): Evidence | null {
  const exact = evidence.find((e) => e.ref === ref);
  if (exact) return exact;
  const p = parseRef(ref);
  if (!p) return null;
  if (p.type === "diff") {
    return (
      evidence.find((e) => {
        if (e.payload.kind !== "diff_hunk" || e.payload.hunk.file !== p.path) return false;
        const lines = e.payload.hunk.lines
          .map((l) => l.newLine)
          .filter((n): n is number => n !== null);
        return lines.length > 0 && p.start >= Math.min(...lines) && p.end <= Math.max(...lines) + 1;
      }) ?? null
    );
  }
  if (p.type === "code") {
    return (
      evidence.find(
        (e) =>
          e.payload.kind === "code" &&
          e.payload.path === p.path &&
          p.start >= e.payload.startLine &&
          p.end < e.payload.startLine + e.payload.lines.length,
      ) ?? null
    );
  }
  if (p.type === "test")
    return (
      evidence.find(
        (e) =>
          e.kind === "test_case" && (e.ref.endsWith(p.name) || p.name.endsWith(e.ref.slice(5))),
      ) ?? null
    );
  return null;
}

function range(ref: string): { start: number; end: number } | null {
  const p = parseRef(ref);
  return p && (p.type === "diff" || p.type === "code") ? { start: p.start, end: p.end } : null;
}

const KIND_LABEL: Record<Evidence["kind"], string> = {
  diff_hunk: "Diff",
  file: "File",
  test_case: "Test",
  ci_step: "CI",
  screenshot: "Screenshot",
  log: "Log",
  agent_artifact: "Agent artifact",
  agent_claim: "The agent's description",
  task: "The request",
  code: "Code before the change",
  doc: "Documentation",
  module_map: "Module map",
  decision: "Agent decision log",
};

export function mediaUrl(blobPath: string): string {
  const i = blobPath.indexOf("/data/");
  return `/api/media/${blobPath
    .slice(i + 6)
    .split("/")
    .map(encodeURIComponent)
    .join("/")}`;
}

export function EvidenceItem({ citedRef, evidence }: { citedRef: string; evidence: Evidence[] }) {
  const e = findEvidence(citedRef, evidence);
  if (!e) return <div className="py-3 text-sm text-dust">Evidence not found: {citedRef}</div>;
  const r = range(citedRef);
  const p = e.payload;
  return (
    <figure className="border-t border-rule py-4">
      <figcaption className="mb-3 flex items-baseline justify-between gap-3">
        <span className="kicker">{KIND_LABEL[e.kind]}</span>
        <span className="truncate font-mono text-[11px] text-dust">{e.title}</span>
      </figcaption>
      {p.kind === "diff_hunk" && <DiffLines lines={p.hunk.lines} range={r} />}
      {p.kind === "code" && (
        <pre className="overflow-x-auto font-mono text-[12.5px] leading-[1.7] text-stone">
          {p.lines.map((text, i) => {
            const n = p.startLine + i;
            const on = !r || (n >= r.start && n <= r.end);
            return (
              <div key={n} className={`flex gap-3 pr-3 ${on && r ? "bg-raise text-text" : ""}`}>
                <span className="w-8 shrink-0 text-right text-dust">{n}</span>
                <span className="whitespace-pre">{text}</span>
              </div>
            );
          })}
        </pre>
      )}
      {p.kind === "test_case" && (
        <div className="text-sm">
          <span
            className={
              p.test.status === "failed"
                ? "text-oxide"
                : p.test.status === "skipped"
                  ? "text-ochre"
                  : "text-stone"
            }
          >
            {p.test.status === "passed"
              ? "Passed"
              : p.test.status === "failed"
                ? "Failed"
                : "Skipped"}
          </span>
          <span className="ml-3 text-text-2">{p.test.name}</span>
          {p.test.message && (
            <pre className="mt-2 whitespace-pre-wrap font-mono text-xs text-dust">
              {p.test.message}
            </pre>
          )}
        </div>
      )}
      {p.kind === "ci_step" && (
        <div className="text-sm">
          <span className={p.step.conclusion === "failure" ? "text-oxide" : "text-stone"}>
            {p.step.conclusion}
          </span>
          <span className="ml-3 text-text-2">{p.step.name}</span>
          {p.step.summary && <p className="mt-2 text-stone">{p.step.summary}</p>}
        </div>
      )}
      {p.kind === "screenshot" && e.blobPath && (
        // biome-ignore lint/performance/noImgElement: authenticated media, not a static asset
        <img
          src={mediaUrl(e.blobPath)}
          alt={`${p.label} ${p.variant}`}
          className="w-full border border-rule"
        />
      )}
      {p.kind === "agent_claim" && (
        <blockquote className="border-l border-stone pl-4 text-[14px] italic leading-relaxed text-text-2">
          {p.text.slice(0, 900)}
          {p.text.length > 900 ? "…" : ""}
          <footer className="mt-2 font-sans text-xs not-italic text-dust">
            Written by the agent. Not verified.
          </footer>
        </blockquote>
      )}
      {p.kind === "task" && (
        <div>
          <div className="font-medium text-[15px] leading-snug">{p.title}</div>
          <p className="mt-2 whitespace-pre-wrap text-sm leading-relaxed text-stone">{p.body}</p>
          {p.url && (
            <a
              href={p.url}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-xs text-stone underline underline-offset-4"
            >
              {p.source}
            </a>
          )}
        </div>
      )}
      {p.kind === "doc" && (
        <p className="max-h-60 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-stone">
          {p.text.slice(0, 1500)}
        </p>
      )}
      {p.kind === "module_map" && (
        <ul className="space-y-1 font-mono text-xs">
          {p.modules.map((m) => (
            <li key={m.id} className={m.changed ? "text-text" : "text-stone"}>
              {m.id}
              {m.changed ? ` · ${m.changedLines} lines changed` : ""}
            </li>
          ))}
          <li className="pt-2 font-sans text-dust">
            {p.edges.map((x) => `${x.from} → ${x.to}`).join(" · ")}
          </li>
        </ul>
      )}
      {p.kind === "decision" && (
        <div className="text-sm">
          <div className="font-medium text-[15px] leading-snug">{p.chosen}</div>
          <p className="mt-2 leading-relaxed text-stone">{p.rationale}</p>
          {p.alternatives.length > 0 && (
            <div className="mt-3">
              <div className="kicker !text-dust">Considered instead</div>
              <ul className="mt-1 list-none text-text-2">
                {p.alternatives.map((a) => (
                  <li key={a} className="border-t border-rule py-1.5">
                    {a}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
      {p.kind === "file" && (
        <div className="font-mono text-xs text-stone">
          {p.file.path} · +{p.file.additions} −{p.file.deletions}
          {p.file.withheldReason ? ` · ${p.file.withheldReason}` : ""}
        </div>
      )}
      {p.kind === "log" && (
        <pre className="max-h-60 overflow-auto whitespace-pre-wrap font-mono text-xs text-stone">
          {p.text}
        </pre>
      )}
      {p.kind === "agent_artifact" && (
        <a
          href={p.url}
          target="_blank"
          rel="noreferrer"
          className="text-sm underline underline-offset-4"
        >
          {p.label}
        </a>
      )}
    </figure>
  );
}

type HunkLine = {
  type: "add" | "del" | "ctx";
  text: string;
  oldLine: number | null;
  newLine: number | null;
};

/** A hunk opened at the cited lines, with the rest one click away. */
function DiffLines({
  lines,
  range,
}: {
  lines: HunkLine[];
  range: { start: number; end: number } | null;
}) {
  const [all, setAll] = useState(false);
  let from = 0;
  let to = lines.length;
  if (range && !all) {
    const idx = lines
      .map((l, i) =>
        l.newLine !== null && l.newLine >= range.start && l.newLine <= range.end ? i : -1,
      )
      .filter((i) => i >= 0);
    if (idx.length) {
      // Include the removed lines the cited lines replaced: in the same block of changes,
      // sharing at least two identifiers with a cited added line.
      const ids = (t: string) => new Set(t.match(/[A-Za-z_]\w{2,}/g) ?? []);
      let first = idx[0]!;
      for (const i of idx) {
        if (lines[i]!.type !== "add") continue;
        const mine = ids(lines[i]!.text);
        let a = i;
        while (a > 0 && lines[a - 1]!.type !== "ctx") a--;
        for (let j = a; j < i; j++) {
          if (
            lines[j]!.type === "del" &&
            [...ids(lines[j]!.text)].filter((x) => mine.has(x)).length >= 2
          )
            first = Math.min(first, j);
        }
      }
      from = Math.max(0, first - 4);
      to = Math.min(lines.length, idx.at(-1)! + 5);
    }
  }
  const shown = lines.slice(from, to);
  return (
    <>
      <pre className="overflow-x-auto font-mono text-[12.5px] leading-[1.7]">
        {shown.map((l, i) => {
          const inRange =
            range && l.newLine !== null
              ? l.newLine >= range.start && l.newLine <= range.end
              : false;
          return (
            <div
              // biome-ignore lint/suspicious/noArrayIndexKey: lines never reorder
              key={from + i}
              className={`flex gap-3 pr-3 ${l.type === "del" ? "text-dust line-through decoration-oxide/60" : l.type === "add" ? "text-text" : "text-stone"} ${inRange ? "bg-raise" : ""}`}
            >
              <span className="w-8 shrink-0 text-right text-dust">{l.newLine ?? ""}</span>
              <span className="w-3 shrink-0 text-dust">
                {l.type === "add" ? "+" : l.type === "del" ? "−" : ""}
              </span>
              <span className="whitespace-pre">{l.text}</span>
            </div>
          );
        })}
      </pre>
      {(from > 0 || to < lines.length) && (
        <button
          type="button"
          onClick={() => setAll(true)}
          className="mt-2 text-xs text-stone underline underline-offset-4 hover:text-text"
        >
          Show all {lines.length} lines
        </button>
      )}
    </>
  );
}
