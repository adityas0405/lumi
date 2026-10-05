"use client";

import type { Evidence, TaskScript, Timeline, TimelineSentence } from "@lumi/core";
import type { Route } from "next";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { Health } from "@/lib/data";
import { clock } from "@/lib/format";
import { useKeys } from "@/lib/keys";
import { narrowest } from "@/lib/refs";
import { toneOf } from "@/lib/state";
import { KeyHints } from "../KeyHints";
import { Segmented } from "../ui/Segmented";
import { StateWord } from "../ui/StateWord";
import { AskPanel, type QA } from "./AskPanel";
import { DecidePanel, type PastDecision } from "./DecidePanel";
import { EvidenceItem } from "./EvidencePanel";
import {
  type LinkedTaskView,
  OutcomeTimeline,
  type OutcomeView,
  RollbackPanel,
} from "./OutcomeTimeline";

export type Mode = "technical" | "plain";

export interface ReviewData {
  taskId: string;
  title: string;
  agentName: string;
  agentColor: string;
  prNumber: number | null;
  prUrl: string | null;
  prState: string;
  repo: string;
  route: string | null;
  script: TaskScript | null;
  timeline: Timeline | null;
  render: {
    videoUrl: string;
    posterUrl: string | null;
    captionsUrl: string;
    durationMs: number;
  } | null;
  renderInProgress: { status: string; progress: number } | null;
  statusDetail: string | null;
  evidence: Evidence[];
  triage: {
    route: string;
    summary: string;
    defects: { summary: string; explanation: string; refs: string[]; severity: string }[];
    signals: { rule: string; severity: string; message: string; refs: string[] }[];
    model: string;
  } | null;
  decisions: PastDecision[];
  questions: QA[];
  outcomes: OutcomeView[];
  /** Server render time (ISO), for relative times. */
  now: string;
  word: string;
  health: Health;
  reason: string;
  area: string;
  queue: { prev: string | null; next: string | null; position: number | null; total: number };
  revertOf: LinkedTaskView | null;
  revertedBy: LinkedTaskView | null;
}

const CHAPTER_LABEL: Record<string, string> = {
  verdict: "Verdict",
  context: "Context",
  what_changed: "What changed",
  why: "Why",
  how_checked: "How it was checked",
  uncertain: "Open risks",
  decision: "Decision",
};

function sentenceAt(timeline: Timeline | null, ms: number): TimelineSentence | null {
  if (!timeline) return null;
  let current: TimelineSentence | null = null;
  for (const s of timeline.sentences) {
    if (s.startMs - 150 <= ms) current = s;
    else break;
  }
  return current;
}

export function TaskReview({ data }: { data: ReviewData }) {
  const video = useRef<HTMLVideoElement>(null);
  const [ms, setMs] = useState(0);
  const [mode, setMode] = useState<Mode>("technical");
  const [pinned, setPinned] = useState<string[] | null>(null);
  const [tab, setTab] = useState<"evidence" | "ask" | "triage">("evidence");
  const current = sentenceAt(data.timeline, ms);
  const text = (s: TimelineSentence) => (mode === "plain" ? s.plain : s.technical);

  // Smooth time updates while playing (timeupdate fires only ~4×/s).
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (video.current) setMs(video.current.currentTime * 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);

  const seek = useCallback((toMs: number, play = true) => {
    const v = video.current;
    if (!v) return;
    v.currentTime = toMs / 1000;
    if (play) void v.play();
  }, []);

  const router = useRouter();
  const step = (to: string | null) => to && router.push(`/tasks/${to}` as Route);
  const nextSentence = (d: 1 | -1) => {
    const t = data.timeline;
    if (!t) return;
    const i = current ? t.sentences.indexOf(current) : -1;
    const next = t.sentences[Math.max(0, Math.min(t.sentences.length - 1, i + d))];
    if (next) seek(next.startMs);
  };
  useKeys([
    { keys: "n", label: "Next task that needs you", run: () => step(data.queue.next) },
    { keys: "p", label: "Previous task that needs you", run: () => step(data.queue.prev) },
    {
      keys: " ",
      label: "Play or pause the walkthrough",
      run: () => {
        const v = video.current;
        if (v) v.paused ? void v.play() : v.pause();
      },
    },
    { keys: "ArrowRight", label: "Next sentence", run: () => nextSentence(1), quiet: true },
    { keys: "ArrowLeft", label: "Previous sentence", run: () => nextSentence(-1), quiet: true },
    {
      keys: "t",
      label: "Switch technical / plain",
      run: () => setMode((m) => (m === "plain" ? "technical" : "plain")),
    },
  ]);

  const context = useMemo(
    () => data.script?.chapters.find((c) => c.kind === "context") ?? null,
    [data.script],
  );
  const request = data.evidence.find((e) => e.kind === "task");
  const shownRefs = pinned ?? current?.refs ?? [];
  const pin = (refs: string[]) => {
    video.current?.pause();
    setPinned(refs);
    setTab("evidence");
  };

  return (
    <div className="mx-auto max-w-[1320px] px-4 pb-20 sm:px-6">
      {/* Header: what this is and what state it's in, once */}
      <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 pt-5">
        <div className="min-w-0 max-w-4xl">
          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-[13px]">
            <StateWord word={data.word} tone={toneOf(data.health)} />
            {data.reason !== data.word && <span className="text-stone">{data.reason}</span>}
          </div>
          <h1 className="mt-1.5 text-[20px] font-semibold leading-snug">
            {data.script?.headline ?? data.title}
          </h1>
          <div className="mt-1 text-[13px] text-dust">
            <span style={{ color: data.agentColor }}>{data.agentName}</span>
            {" · "}
            {data.prNumber ? (
              <a
                href={data.prUrl ?? "#"}
                target="_blank"
                rel="noreferrer"
                className="font-mono hover:text-text"
              >
                #{data.prNumber} ↗
              </a>
            ) : (
              "SDK task"
            )}
            {" · "}
            {data.prState} · {data.area} · <span className="text-stone">{data.title}</span>
          </div>
        </div>
        <div className="flex items-center gap-4">
          {data.queue.position && (
            <span className="text-[12px] text-dust">
              {data.queue.position} of {data.queue.total} that need you
            </span>
          )}
          <Segmented<Mode>
            label="Wording"
            value={mode}
            onChange={setMode}
            options={[
              { value: "technical", label: "Technical" },
              { value: "plain", label: "Plain" },
            ]}
          />
        </div>
      </div>

      {/* The decision, right where the reviewer has read the verdict */}
      {!data.revertOf && (
        <DecidePanel
          taskId={data.taskId}
          prNumber={data.prNumber}
          past={data.decisions}
          recommendation={data.script?.decision ?? null}
          now={data.now}
          open={data.prState === "open"}
        />
      )}

      <div className="mt-5 grid gap-8 xl:grid-cols-[minmax(0,1fr)_400px]">
        <div className="min-w-0">
          {/* Findings, with the code they point at: no playback needed */}
          {data.triage && <Findings triage={data.triage} evidence={data.evidence} onPick={pin} />}

          {/* Before you review */}
          {(context || request) && (
            <section className="mt-8">
              <h2 className="kicker border-b border-rule pb-2">Before you review</h2>
              <div className="mt-3 grid gap-6 lg:grid-cols-[1fr_1.5fr]">
                <div>
                  {request?.payload.kind === "task" && (
                    <p className="text-[14px] font-medium">
                      Asked:{" "}
                      <span className="font-normal text-text-2">{request.payload.title}</span>
                    </p>
                  )}
                  {data.script && mode === "plain" && (
                    <p className="mt-2 text-[13.5px] leading-relaxed text-stone">
                      {data.script.businessImpact}
                    </p>
                  )}
                </div>
                {context && (
                  <ol className="space-y-2">
                    {context.sentences.map((s) => (
                      <li key={s.id} className="text-[14px] leading-relaxed text-text-2">
                        {mode === "plain" ? s.plain : s.technical}
                        {s.attributedToAgent && (
                          <span className="ml-2 text-xs text-dust">(the agent's words)</span>
                        )}
                      </li>
                    ))}
                  </ol>
                )}
              </div>
            </section>
          )}

          {/* The walkthrough */}
          <section className="mt-8">
            <h2 className="kicker border-b border-rule pb-2">
              Walkthrough{data.timeline ? ` · ${clock(data.timeline.durationMs)}` : ""}
            </h2>
            <div className="mt-3">
              {data.render && data.timeline ? (
                <>
                  <video
                    ref={video}
                    src={data.render.videoUrl}
                    poster={data.render.posterUrl ?? undefined}
                    playsInline
                    preload="metadata"
                    className="aspect-video w-full cursor-pointer bg-surface"
                    onClick={() =>
                      video.current?.paused ? void video.current.play() : video.current?.pause()
                    }
                  >
                    <track
                      kind="captions"
                      src={`${data.render.captionsUrl}${mode === "plain" ? "&mode=plain" : ""}`}
                      srcLang="en"
                      label={mode === "plain" ? "Plain" : "Technical"}
                    />
                  </video>
                  <Controls video={video} ms={ms} durationMs={data.timeline.durationMs} />
                  <ChapterBar timeline={data.timeline} ms={ms} onSeek={seek} />
                  {mode === "plain" && current && (
                    <p className="mt-3 border-l border-stone pl-3 text-[14px] leading-snug text-text-2">
                      {current.plain}
                    </p>
                  )}
                </>
              ) : data.revertOf ? (
                <RollbackPanel
                  revertOf={data.revertOf}
                  prNumber={data.prNumber}
                  prUrl={data.prUrl}
                  prState={data.prState}
                />
              ) : (
                <div className="flex aspect-video w-full flex-col items-center justify-center border border-rule bg-surface text-center">
                  <div className="kicker">
                    {data.renderInProgress ? "Preparing the walkthrough" : "No video yet"}
                  </div>
                  <p className="mt-2 max-w-sm text-[13px] text-stone">
                    {data.statusDetail ?? "Lumi is reviewing this change."}
                  </p>
                  {data.renderInProgress && (
                    <span className="mt-4 block h-px w-48 bg-rule">
                      <span
                        className="block h-px bg-text"
                        style={{ width: `${Math.round(data.renderInProgress.progress * 100)}%` }}
                      />
                    </span>
                  )}
                </div>
              )}
            </div>
          </section>

          <OutcomeTimeline outcomes={data.outcomes} revertedBy={data.revertedBy} now={data.now} />

          {data.timeline && (
            <section className="mt-8">
              <h2 className="kicker border-b border-rule pb-2">Transcript</h2>
              {data.timeline.chapters.map((ch) => (
                <div key={ch.id} className="mt-4">
                  <h3 className="text-[13px] text-stone">{CHAPTER_LABEL[ch.kind] ?? ch.title}</h3>
                  <div className="mt-1">
                    {data
                      .timeline!.sentences.filter((s) => s.chapterId === ch.id)
                      .map((s) => (
                        <button
                          key={s.id}
                          type="button"
                          onClick={() => {
                            setPinned(null);
                            seek(s.startMs);
                          }}
                          className={`grid w-full grid-cols-[44px_1fr] gap-3 py-1 text-left text-[14px] leading-relaxed ${current?.id === s.id ? "text-text" : "text-stone hover:text-text-2"}`}
                        >
                          <span className="pt-0.5 font-mono text-xs text-dust">
                            {clock(s.startMs)}
                          </span>
                          <span>
                            {s.voice !== "narrator" && (
                              <span className="mr-2 text-xs" style={{ color: data.agentColor }}>
                                {data.agentName}:
                              </span>
                            )}
                            {text(s)}
                            {s.confidence !== "confident" && (
                              <span className="ml-2 text-xs text-ochre">{s.confidence}</span>
                            )}
                          </span>
                        </button>
                      ))}
                  </div>
                </div>
              ))}
            </section>
          )}
          <div className="mt-8">
            <KeyHints
              hints={[
                ["a", "approve"],
                ["r", "request changes"],
                ["x", "reject"],
                ["n p", "next / previous"],
                ["Space", "play"],
                ["t", "plain"],
              ]}
            />
          </div>
        </div>

        {/* Side column: what the video is citing, questions, rule signals */}
        <aside className="min-w-0 xl:sticky xl:top-4 xl:self-start">
          <div className="flex gap-5 border-b border-rule text-[13px]" role="tablist">
            {(
              [
                ["evidence", "Evidence"],
                ["ask", `Ask${data.questions.length ? ` · ${data.questions.length}` : ""}`],
                ["triage", "Signals"],
              ] as const
            ).map(([k, label]) => (
              <button
                key={k}
                type="button"
                role="tab"
                aria-selected={tab === k}
                onClick={() => setTab(k)}
                className={`-mb-px border-b pb-2.5 ${tab === k ? "border-text text-text" : "border-transparent text-stone hover:text-text"}`}
              >
                {label}
              </button>
            ))}
          </div>

          {tab === "evidence" && (
            <div className="xl:max-h-[calc(100vh-6rem)] xl:overflow-y-auto">
              <div className="flex items-baseline justify-between py-2.5 text-xs text-dust">
                <span>
                  {pinned
                    ? "Showing the evidence you picked"
                    : current
                      ? `Cited at ${clock(current.startMs)}`
                      : "Pick a finding's citation, or play the walkthrough"}
                </span>
                {pinned && (
                  <button
                    type="button"
                    className="text-text underline underline-offset-4"
                    onClick={() => setPinned(null)}
                  >
                    Follow video
                  </button>
                )}
              </div>
              {current && !pinned && (
                <p className="pb-3 text-[13.5px] leading-relaxed text-text-2">{text(current)}</p>
              )}
              {shownRefs.map((r) => (
                <EvidenceItem key={r} citedRef={r} evidence={data.evidence} />
              ))}
            </div>
          )}

          {tab === "ask" && (
            <AskPanel
              endpoint={`/api/tasks/${data.taskId}/ask`}
              initial={data.questions}
              watching={current ? `${clock(current.startMs)}: ${current.technical}` : undefined}
              videoTimeMs={Math.round(ms)}
              onShowRefs={pin}
              beforeAsk={() => video.current?.pause()}
            />
          )}

          {tab === "triage" && data.triage && (
            <div className="py-3 text-[13px]">
              <p className="leading-relaxed text-text-2">{data.triage.summary}</p>
              <ul className="mt-3">
                {data.triage.signals.map((s) => (
                  <li
                    key={`${s.rule}${s.message}`}
                    className="flex gap-3 border-t border-rule py-2"
                  >
                    <span
                      className={`w-14 shrink-0 text-xs ${s.severity === "block" ? "text-oxide" : s.severity === "review" ? "text-ochre" : "text-dust"}`}
                    >
                      {s.severity}
                    </span>
                    <span className="text-stone">{s.message}</span>
                  </li>
                ))}
              </ul>
              <p className="mt-4 text-xs text-dust">
                Reviewed by {data.triage.model}. Auto-pass is off: every change still reaches a
                person.
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  );
}

/** The triage findings, each with the code it cites, visible without playing anything. */
function Findings({
  triage,
  evidence,
  onPick,
}: {
  triage: NonNullable<ReviewData["triage"]>;
  evidence: Evidence[];
  onPick: (refs: string[]) => void;
}) {
  const serious = triage.defects.filter((d) => d.severity !== "low");
  return (
    <section>
      <h2 className="kicker border-b border-rule pb-2">
        Findings{serious.length ? ` · ${serious.length}` : ""}
      </h2>
      {serious.length === 0 ? (
        <p className="mt-3 text-[14px] text-text-2">
          No problems found. <span className="text-stone">{triage.summary}</span>
        </p>
      ) : (
        serious.map((d) => {
          const ref = narrowest(d.refs);
          return (
            <article key={d.summary} className="mt-3 border-b border-rule pb-4">
              <div className="flex gap-2 text-[14.5px]">
                <span
                  className={`shrink-0 font-medium ${d.severity === "high" ? "text-oxide" : "text-ochre"}`}
                >
                  {d.severity === "high" ? "High" : "Medium"}
                </span>
                <span className="font-medium text-text">{d.summary}</span>
              </div>
              <p className="mt-1 text-[13.5px] leading-relaxed text-stone">{d.explanation}</p>
              {ref && <EvidenceItem citedRef={ref} evidence={evidence} />}
              {d.refs.length > 1 && (
                <RefChips refs={d.refs.filter((r) => r !== ref)} onPick={onPick} />
              )}
            </article>
          );
        })
      )}
    </section>
  );
}

function chipLabel(ref: string): string {
  const [kind, rest = ""] = [ref.slice(0, ref.indexOf(":")), ref.slice(ref.indexOf(":") + 1)];
  const lines = (s: string) =>
    s.replace(/#L(\d+)-L(\d+)$/, (_, a, b) => (a === b ? ` · ${a}` : ` · ${a}–${b}`));
  switch (kind) {
    case "task":
      return `request #${rest}`;
    case "claim":
      return "agent's description";
    case "decision":
      return "agent's decision log";
    case "map":
      return "module map";
    case "diff":
    case "code":
      return `${kind} ${lines(rest)}`;
    default:
      return `${kind} ${rest}`;
  }
}

export function RefChips({ refs, onPick }: { refs: string[]; onPick: (refs: string[]) => void }) {
  if (refs.length === 0) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-2">
      {refs.map((r) => (
        <button
          key={r}
          type="button"
          onClick={() => onPick([r])}
          className="border border-rule px-2 py-0.5 font-mono text-[11px] text-stone hover:border-stone hover:text-text"
        >
          {chipLabel(r)}
        </button>
      ))}
    </div>
  );
}

export function ChapterBar({
  timeline,
  ms,
  onSeek,
}: {
  timeline: Timeline;
  ms: number;
  onSeek: (ms: number) => void;
}) {
  const total = timeline.durationMs;
  return (
    <nav className="mt-3 flex gap-1" aria-label="Chapters">
      {timeline.chapters.map((c, i) => {
        const next = timeline.chapters[i + 1]?.startMs ?? total;
        const width = ((next - c.startMs) / total) * 100;
        const on = ms >= c.startMs - 150 && ms < next;
        const fill = on
          ? Math.min(1, Math.max(0, (ms - c.startMs) / (next - c.startMs)))
          : ms >= next
            ? 1
            : 0;
        return (
          <button
            key={c.id}
            type="button"
            onClick={() => onSeek(c.startMs)}
            style={{ width: `${width}%` }}
            className="group text-left"
            title={CHAPTER_LABEL[c.kind] ?? c.title}
          >
            <span className="block h-[3px] bg-rule">
              <span className="block h-[3px] bg-text" style={{ width: `${fill * 100}%` }} />
            </span>
            <span
              className={`mt-2 block truncate text-xs ${on ? "text-text" : "text-dust group-hover:text-stone"}`}
            >
              {CHAPTER_LABEL[c.kind] ?? c.title}
            </span>
          </button>
        );
      })}
    </nav>
  );
}

/** Slim controls under the video, so nothing covers the frame's own captions. */
export function Controls({
  video,
  ms,
  durationMs,
}: {
  video: React.RefObject<HTMLVideoElement | null>;
  ms: number;
  durationMs: number;
}) {
  const [paused, setPaused] = useState(true);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  useEffect(() => {
    const v = video.current;
    if (!v) return;
    const sync = () => {
      setPaused(v.paused);
      setMuted(v.muted);
    };
    v.addEventListener("play", sync);
    v.addEventListener("pause", sync);
    v.addEventListener("volumechange", sync);
    return () => {
      v.removeEventListener("play", sync);
      v.removeEventListener("pause", sync);
      v.removeEventListener("volumechange", sync);
    };
  }, [video]);
  const rates = [1, 1.25, 1.5];
  return (
    <div className="mt-3 flex items-center gap-5 text-sm">
      <button
        type="button"
        onClick={() => (video.current?.paused ? void video.current.play() : video.current?.pause())}
        className="w-14 text-left text-text"
        aria-label={paused ? "Play" : "Pause"}
      >
        {paused ? "Play" : "Pause"}
      </button>
      <span className="font-mono text-xs text-stone tabular-nums">
        {clock(ms)} / {clock(durationMs)}
      </span>
      <span className="ml-auto flex items-center gap-5 text-xs text-stone">
        <button
          type="button"
          onClick={() => {
            const next = rates[(rates.indexOf(rate) + 1) % rates.length]!;
            if (video.current) video.current.playbackRate = next;
            setRate(next);
          }}
          className="hover:text-text"
          aria-label="Playback speed"
        >
          {rate}×
        </button>
        <button
          type="button"
          onClick={() => {
            if (video.current) video.current.muted = !video.current.muted;
          }}
          className="hover:text-text"
        >
          {muted ? "Unmute" : "Mute"}
        </button>
        <button
          type="button"
          onClick={() => void video.current?.requestFullscreen()}
          className="hover:text-text"
        >
          Full screen
        </button>
      </span>
    </div>
  );
}
