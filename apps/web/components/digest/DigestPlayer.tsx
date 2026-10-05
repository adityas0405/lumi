"use client";

import type { TimelineSentence } from "@lumi/core";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import type { DigestView } from "@/lib/digests";
import { AGENT_VAR, clock } from "@/lib/format";
import { AskPanel } from "../review/AskPanel";
import { ChapterBar, Controls } from "../review/TaskReview";

const SECTION: Record<string, { label: string; tone: string }> = {
  decisions: { label: "Decisions", tone: "text-ochre" },
  problems: { label: "Problems", tone: "text-oxide" },
  highlights: { label: "Highlights", tone: "text-stone" },
};

export function DigestPlayer({ digest }: { digest: DigestView }) {
  const video = useRef<HTMLVideoElement>(null);
  const [ms, setMs] = useState(0);
  const [plain, setPlain] = useState(false);
  useEffect(() => {
    let raf = 0;
    const tick = () => {
      if (video.current) setMs(video.current.currentTime * 1000);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, []);
  const seek = useCallback((to: number) => {
    if (!video.current) return;
    video.current.currentTime = to / 1000;
    void video.current.play();
  }, []);

  const sentences = digest.timeline?.sentences ?? [];
  let current: TimelineSentence | null = null;
  for (const s of sentences) if (s.startMs - 150 <= ms) current = s;
  const nowTask = current?.refs.find((r) => r.startsWith("review:"))?.slice(7);
  const nowItem = digest.items.find((i) => i.taskId === nowTask);
  const firstSentence = (taskId: string) =>
    sentences.find((s) => s.refs.includes(`review:${taskId}`));

  return (
    <div className="mx-auto max-w-5xl px-4 pb-24 sm:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4 pt-8">
        <div>
          <div className="kicker">
            Daily digest · {digest.dateLabel} · {digest.repo}
          </div>
          <h1 className="mt-3 font-semibold text-[22px] leading-tight">
            {[
              digest.counts.decisions &&
                `${digest.counts.decisions} decision${digest.counts.decisions === 1 ? "" : "s"}`,
              digest.counts.problems &&
                `${digest.counts.problems} problem${digest.counts.problems === 1 ? "" : "s"}`,
              digest.counts.done && `${digest.counts.done} done`,
            ]
              .filter(Boolean)
              .join(" · ") || "A quiet day"}
          </h1>
        </div>
        <fieldset className="flex border border-rule text-sm" aria-label="View">
          {[false, true].map((p) => (
            <button
              key={String(p)}
              type="button"
              onClick={() => setPlain(p)}
              className={`px-4 py-1.5 ${plain === p ? "bg-text text-bg" : "text-stone hover:text-text"}`}
            >
              {p ? "Plain" : "Technical"}
            </button>
          ))}
        </fieldset>
      </div>

      {digest.video && digest.timeline ? (
        <div className="mt-8">
          <video
            ref={video}
            src={digest.video.url}
            poster={digest.video.poster ?? undefined}
            playsInline
            preload="metadata"
            className="aspect-video w-full cursor-pointer bg-surface"
            onClick={() =>
              video.current?.paused ? void video.current.play() : video.current?.pause()
            }
          >
            <track kind="captions" />
          </video>
          <Controls video={video} ms={ms} durationMs={digest.timeline.durationMs} />
          <ChapterBar timeline={digest.timeline} ms={ms} onSeek={seek} />
          {nowItem && (
            <Link
              href={`/tasks/${nowItem.taskId}`}
              className="mt-5 flex items-baseline justify-between gap-4 border-l border-text pl-4 hover:bg-surface"
            >
              <span className="font-medium text-[15px] leading-snug">{nowItem.headline}</span>
              <span className="shrink-0 text-sm text-stone">Open the full review →</span>
            </Link>
          )}
        </div>
      ) : (
        <div className="mt-8 flex aspect-video items-center justify-center border border-rule bg-surface text-sm text-stone">
          {digest.status === "failed" ? "This digest failed to render." : "Rendering the digest…"}
        </div>
      )}

      {(["decisions", "problems", "highlights"] as const).map((section) => {
        const items = digest.items.filter((i) => i.section === section);
        if (!items.length) return null;
        return (
          <section key={section} className="mt-12">
            <h2 className={`kicker border-b border-rule pb-3 ${SECTION[section]!.tone}`}>
              {SECTION[section]!.label} · {items.length}
            </h2>
            <ul>
              {items.map((i) => {
                const at = firstSentence(i.taskId);
                return (
                  <li
                    key={i.taskId}
                    className="grid gap-x-8 gap-y-2 border-b border-rule py-5 sm:grid-cols-[160px_1fr]"
                  >
                    <div className="text-sm">
                      <div style={{ color: AGENT_VAR[i.agent] }}>{i.agentName}</div>
                      <div className="mt-1 font-mono text-xs text-dust">
                        {i.prNumber ? `PR #${i.prNumber}` : ""}
                      </div>
                    </div>
                    <div>
                      <Link
                        href={`/tasks/${i.taskId}`}
                        className="font-medium text-[15px] leading-snug hover:underline hover:decoration-1 hover:underline-offset-4"
                      >
                        {i.headline}
                      </Link>
                      <p className="mt-2 text-[15px] leading-relaxed text-stone">
                        {i.why && (
                          <span className="text-text">
                            {plain ? i.why.plain : i.why.technical}{" "}
                          </span>
                        )}
                        {(plain ? i.plain : i.technical).join(" ")}
                      </p>
                      {at && (
                        <button
                          type="button"
                          onClick={() => seek(at.startMs)}
                          className="mt-2 text-xs text-dust hover:text-text"
                        >
                          Play from {clock(at.startMs)}
                        </button>
                      )}
                    </div>
                  </li>
                );
              })}
            </ul>
          </section>
        );
      })}

      {digest.routineLine.technical && (
        <section className="mt-12">
          <h2 className="kicker border-b border-rule pb-3">Routine</h2>
          <p className="py-4 text-[15px] leading-relaxed text-stone">
            {plain ? digest.routineLine.plain : digest.routineLine.technical}
          </p>
        </section>
      )}

      {digest.tasks.length > 0 && <AllWork tasks={digest.tasks} />}

      <section className="mt-12">
        <h2 className="kicker border-b border-rule pb-3">Ask</h2>
        <AskPanel
          endpoint={`/api/digest/${digest.id}/ask`}
          initial={digest.questions}
          label="Ask across today's work. Answers come only from these tasks' reviews and evidence."
          placeholder="What's riskiest today?"
          watching={nowItem ? `${nowItem.agentName}: ${nowItem.headline}` : undefined}
          extra={nowItem ? { taskId: nowItem.taskId } : undefined}
          videoTimeMs={Math.round(ms)}
          beforeAsk={() => video.current?.pause()}
          onShowRefs={() => {}}
          renderRefs={(refs) => <TaskLinks refs={refs} digest={digest} />}
        />
      </section>
    </div>
  );
}

/** Links to the tasks a digest answer cites. */
function TaskLinks({ refs, digest }: { refs: string[]; digest: DigestView }) {
  const ids = refs.filter((r) => r.startsWith("review:")).map((r) => r.slice(7));
  if (!ids.length) return null;
  return (
    <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs">
      {ids.map((id) => {
        const t = digest.tasks.find((x) => x.taskId === id);
        const item = digest.items.find((x) => x.taskId === id);
        return (
          <Link key={id} href={`/tasks/${id}`} className="text-stone hover:text-text">
            {t?.prNumber || item?.prNumber ? `PR #${t?.prNumber ?? item?.prNumber} · ` : ""}
            {item?.headline ?? t?.title ?? "Open the review"} →
          </Link>
        );
      })}
    </div>
  );
}

/** Every task in the digest under the request it answers, the way an owner thinks about work. */
function AllWork({ tasks }: { tasks: DigestView["tasks"] }) {
  const groups = new Map<
    string,
    { request: DigestView["tasks"][number]["request"]; tasks: DigestView["tasks"] }
  >();
  for (const t of tasks) {
    const key = t.request?.ref ?? `none:${t.taskId}`;
    const g = groups.get(key) ?? { request: t.request, tasks: [] };
    g.tasks.push(t);
    groups.set(key, g);
  }
  return (
    <section className="mt-12">
      <h2 className="kicker border-b border-rule pb-3">All work in this digest · {tasks.length}</h2>
      <ul>
        {[...groups.entries()].map(([key, g]) => (
          <li
            key={key}
            className="grid gap-x-8 gap-y-1 border-b border-rule py-4 sm:grid-cols-[1fr_1.2fr]"
          >
            <div>
              <div
                className={`font-medium text-[15px] leading-snug ${g.request ? "" : "text-dust"}`}
              >
                {g.request ? g.request.title : "No linked request"}
              </div>
              {g.request && (
                <div className="mt-1 font-mono text-xs text-dust">
                  #{g.request.number}
                  {g.request.requestedBy ? ` · asked by @${g.request.requestedBy}` : ""}
                </div>
              )}
            </div>
            <ul className="space-y-1">
              {g.tasks.map((t) => (
                <li key={t.taskId} className="text-sm">
                  <Link
                    href={`/tasks/${t.taskId}`}
                    className="hover:underline hover:decoration-1 hover:underline-offset-4"
                  >
                    <span style={{ color: AGENT_VAR[t.agent] }}>{t.agentName}</span>
                    <span className="text-stone">
                      {" "}
                      · {t.title}
                      {t.prNumber ? ` · PR #${t.prNumber}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ul>
    </section>
  );
}
