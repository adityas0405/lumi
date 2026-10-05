import type { TimelineSentence } from "@lumi/core";
import { AbsoluteFill, Audio, interpolate, useCurrentFrame, useVideoConfig } from "remotion";
import type { DigestItemView, DigestVideoProps } from "../props";
import { Caption } from "./chrome/Chrome";
import { C, DISPLAY, F, G } from "./theme";
import { formatClock } from "./timing";
import "./fonts";

const smallCaps = {
  fontFamily: F.sans,
  fontSize: 22,
  letterSpacing: "0.14em",
  textTransform: "uppercase" as const,
};
const SECTION = {
  decisions: { label: "Decision", color: C.ochre },
  problems: { label: "Problem", color: C.oxide },
  highlights: { label: "Highlight", color: C.stone },
} as const;
const CHAPTER_LABEL: Record<string, string> = {
  decisions: "Decisions",
  problems: "Problems",
  highlights: "Highlights",
  routine: "Routine",
};

function sentenceAt(sentences: TimelineSentence[], ms: number): TimelineSentence | null {
  let current: TimelineSentence | null = null;
  for (const s of sentences) {
    if (s.startMs - 250 <= ms) current = s;
    else break;
  }
  return current;
}

function Header({ props, ms }: { props: DigestVideoProps; ms: number }) {
  const { timeline } = props;
  const current =
    [...timeline.chapters].reverse().find((c) => c.startMs - 400 <= ms) ?? timeline.chapters[0];
  return (
    <div style={{ position: "absolute", left: G.padX, right: G.padX, top: G.top }}>
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          fontFamily: F.sans,
          fontSize: 28,
          color: C.stone,
        }}
      >
        <span>
          <span style={{ color: C.paper, fontWeight: 500 }}>Daily digest</span>
          <span style={{ color: C.dust, margin: "0 16px" }}>/</span>
          {props.meta.dateLabel} · {props.meta.repo}
        </span>
        <span style={{ fontVariantNumeric: "tabular-nums" }}>
          {formatClock(ms)} / {formatClock(timeline.durationMs)}
        </span>
      </div>
      <div
        style={{
          display: "flex",
          gap: 44,
          marginTop: 34,
          paddingBottom: 22,
          borderBottom: `1px solid ${C.rule}`,
          fontFamily: F.sans,
          fontSize: 25,
          color: C.dust,
        }}
      >
        {timeline.chapters.map((c, i) => {
          const on = c.id === current?.id;
          return (
            <span key={c.id} style={{ color: on ? C.paper : C.dust, position: "relative" }}>
              <span style={{ fontFamily: F.mono, fontSize: 22, marginRight: 12 }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              {c.title || CHAPTER_LABEL[c.kind]}
              {on && (
                <span
                  style={{
                    position: "absolute",
                    left: 0,
                    right: 0,
                    bottom: -23,
                    height: 2,
                    background: C.paper,
                  }}
                />
              )}
            </span>
          );
        })}
      </div>
    </div>
  );
}

function Counts({ counts }: { counts: DigestVideoProps["meta"]["counts"] }) {
  const cells = [
    {
      n: counts.decisions,
      label: counts.decisions === 1 ? "decision needs you" : "decisions need you",
      color: counts.decisions ? C.ochre : C.dust,
    },
    {
      n: counts.problems,
      label: counts.problems === 1 ? "problem" : "problems",
      color: counts.problems ? C.oxide : C.dust,
    },
    { n: counts.done, label: counts.done === 1 ? "task done" : "tasks done", color: C.paper },
  ];
  return (
    <div
      style={{
        position: "absolute",
        left: G.padX,
        right: G.padX,
        top: G.stageTop,
        height: G.stageBottom - G.stageTop,
        display: "flex",
        gap: 120,
        alignItems: "center",
      }}
    >
      {cells.map((c) => (
        <div key={c.label}>
          <div style={{ ...DISPLAY, fontSize: 190, lineHeight: 1, color: c.color }}>{c.n}</div>
          <div style={{ fontFamily: F.sans, fontSize: 30, color: C.stone, marginTop: 14 }}>
            {c.label}
          </div>
        </div>
      ))}
    </div>
  );
}

function ItemCard({ item, index, total }: { item: DigestItemView; index: number; total: number }) {
  const s = SECTION[item.section];
  return (
    <div
      style={{
        position: "absolute",
        left: G.padX,
        right: G.padX,
        top: G.stageTop,
        height: G.stageBottom - G.stageTop,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <div style={{ ...smallCaps, color: s.color }}>
        {s.label} {index + 1} of {total}
      </div>
      <div style={{ marginTop: 20, fontFamily: F.sans, fontSize: 28, color: C.stone }}>
        <span style={{ color: item.agentColor, fontWeight: 500 }}>{item.agentName}</span>
        {item.prNumber ? <span style={{ color: C.dust }}> · PR #{item.prNumber}</span> : null}
      </div>
      {item.request ? (
        <div
          style={{
            marginTop: 10,
            fontFamily: F.sans,
            fontSize: 25,
            color: item.request.linked ? C.stone : C.dust,
            maxWidth: 1560,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
        >
          {item.request.label}
        </div>
      ) : null}
      <div
        style={{
          ...DISPLAY,
          fontSize: 68,
          lineHeight: 1.14,
          marginTop: 18,
          maxWidth: 1560,
          color: C.paper,
          textWrap: "balance",
        }}
      >
        {item.headline}
      </div>
      <div
        style={{
          marginTop: 30,
          paddingTop: 22,
          borderTop: `1px solid ${C.rule}`,
          display: "flex",
          gap: 60,
          fontFamily: F.sans,
          fontSize: 27,
          color: C.stone,
        }}
      >
        <span style={{ color: C.paperDim }}>{item.recommendation}</span>
        {item.reviewDurationMs ? (
          <span>Full review · {formatClock(item.reviewDurationMs)}</span>
        ) : null}
      </div>
    </div>
  );
}

function Routine({ routine }: { routine: DigestVideoProps["routine"] }) {
  return (
    <div
      style={{
        position: "absolute",
        left: G.padX,
        right: G.padX,
        top: G.stageTop,
        height: G.stageBottom - G.stageTop,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
      }}
    >
      <div style={{ ...smallCaps, color: C.stone }}>Routine · {routine.length}</div>
      <div style={{ marginTop: 20 }}>
        {routine.slice(0, 6).map((r) => (
          <div
            key={r.title}
            style={{
              display: "flex",
              gap: 30,
              padding: "14px 0",
              borderTop: `1px solid ${C.rule}`,
              fontFamily: F.sans,
              fontSize: 30,
            }}
          >
            <span style={{ width: 220, color: C.stone }}>{r.agentName}</span>
            <span style={{ color: C.paperDim }}>{r.title}</span>
          </div>
        ))}
        {routine.length === 0 && (
          <div style={{ ...DISPLAY, fontSize: 56, color: C.stone }}>Nothing routine today.</div>
        )}
      </div>
    </div>
  );
}

export function DigestVideo(props: DigestVideoProps) {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const ms = (frame / fps) * 1000;
  const { timeline } = props;
  const sentence = sentenceAt(timeline.sentences, ms);
  const taskId = sentence?.refs.find((r) => r.startsWith("review:"))?.slice(7);
  const item = taskId ? props.items.find((i) => i.taskId === taskId) : undefined;
  const bodyOpacity = interpolate(ms, [timeline.leadInMs - 450, timeline.leadInMs], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const titleOpacity = 1 - bodyOpacity;
  const sameSection = item ? props.items.filter((i) => i.section === item.section) : [];
  const sceneKey = item
    ? `item-${item.taskId}`
    : sentence?.refs.includes("digest:routine")
      ? "routine"
      : "counts";
  const sceneStart = sentence
    ? (timeline.sentences.find(
        (s) =>
          (s.refs.find((r) => r.startsWith("review:"))?.slice(7) ?? s.refs[0]) ===
          (taskId ?? sentence.refs[0]),
      )?.startMs ?? sentence.startMs)
    : 0;
  const fade = interpolate(ms, [sceneStart - 250, sceneStart + 30], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <AbsoluteFill style={{ background: C.ink, color: C.paper }}>
      <Audio src={props.audioSrc} />
      {titleOpacity > 0 && (
        <AbsoluteFill
          style={{
            opacity: titleOpacity,
            padding: `${G.top}px ${G.padX}px 80px`,
            display: "flex",
            flexDirection: "column",
          }}
        >
          <div style={{ ...smallCaps, fontSize: 25, color: C.stone }}>
            Lumi · Daily digest · {props.meta.dateLabel}
          </div>
          <div
            style={{
              ...DISPLAY,
              fontSize: 110,
              lineHeight: 1.05,
              marginTop: 70,
              maxWidth: 1500,
              textWrap: "balance",
            }}
          >
            {props.meta.counts.decisions + props.meta.counts.problems === 0
              ? "Nothing needs you today."
              : `${props.meta.counts.decisions ? `${props.meta.counts.decisions} decision${props.meta.counts.decisions === 1 ? "" : "s"}` : ""}${props.meta.counts.decisions && props.meta.counts.problems ? " and " : ""}${props.meta.counts.problems ? `${props.meta.counts.problems} problem${props.meta.counts.problems === 1 ? "" : "s"}` : ""} need you.`}
          </div>
          <div
            style={{
              marginTop: "auto",
              borderTop: `1px solid ${C.rule}`,
              paddingTop: 30,
              fontFamily: F.sans,
              fontSize: 30,
              color: C.stone,
            }}
          >
            {props.meta.counts.done
              ? `${props.meta.counts.done} task${props.meta.counts.done === 1 ? "" : "s"} done by your agents · `
              : ""}
            {props.meta.repo}
          </div>
        </AbsoluteFill>
      )}
      <AbsoluteFill style={{ opacity: bodyOpacity }}>
        <Header props={props} ms={ms} />
        <div key={sceneKey} style={{ opacity: fade }}>
          {item ? (
            <ItemCard item={item} index={sameSection.indexOf(item)} total={sameSection.length} />
          ) : sentence?.refs.includes("digest:routine") ? (
            <Routine routine={props.routine} />
          ) : (
            <Counts counts={props.meta.counts} />
          )}
        </div>
        <Caption sentence={sentence} ms={ms} hidden={!sentence} />
        {item && (
          <div
            style={{
              position: "absolute",
              right: G.padX,
              bottom: 76,
              fontFamily: F.mono,
              fontSize: 22,
              color: C.dust,
            }}
          >
            <span style={{ color: C.stone }}>review</span>{" "}
            {item.prNumber ? `PR #${item.prNumber}` : item.taskId.slice(0, 8)}
          </div>
        )}
      </AbsoluteFill>
    </AbsoluteFill>
  );
}
