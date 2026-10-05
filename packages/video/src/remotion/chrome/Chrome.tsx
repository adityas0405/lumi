import type { Timeline, TimelineSentence } from "@lumi/core";
import { interpolate } from "remotion";
import type { TaskVideoProps } from "../../props";
import { C, DISPLAY, F, G } from "../theme";
import { formatClock, spokenFraction } from "../timing";
import { Words } from "./Words";

const CHAPTER_LABEL: Record<string, string> = {
  verdict: "Verdict",
  context: "Context",
  what_changed: "What changed",
  why: "Why",
  how_checked: "How it was checked",
  uncertain: "Open risks",
  decision: "Decision",
};

export function Header({
  meta,
  timeline,
  ms,
}: {
  meta: TaskVideoProps["meta"];
  timeline: Timeline;
  ms: number;
}) {
  const current =
    [...timeline.chapters].reverse().find((c) => c.startMs - 400 <= ms) ?? timeline.chapters[0];
  const whatChanged = timeline.chapters.filter((c) => c.kind === "what_changed");
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
          <span style={{ color: meta.agentColor, fontWeight: 500 }}>{meta.agentName}</span>
          <span style={{ color: C.dust, margin: "0 16px" }}>/</span>
          {meta.title}
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
          const part =
            c.kind === "what_changed" && whatChanged.length > 1
              ? ` ${whatChanged.indexOf(c) + 1}`
              : "";
          return (
            <span key={c.id} style={{ color: on ? C.paper : C.dust, position: "relative" }}>
              <span style={{ fontFamily: F.mono, fontSize: 22, marginRight: 12 }}>
                {String(i + 1).padStart(2, "0")}
              </span>
              {CHAPTER_LABEL[c.kind] ?? c.title}
              {part}
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

/** Shrinks long sentences so they always fit in three lines below the stage. */
function captionSize(text: string): number {
  const n = text.length;
  if (n > 230) return 36;
  if (n > 185) return 40;
  if (n > 150) return 44;
  return 50;
}

export function Caption({
  sentence,
  ms,
  hidden,
}: {
  sentence: TimelineSentence | null;
  ms: number;
  hidden: boolean;
}) {
  if (!sentence) return null;
  const opacity = hidden
    ? 0
    : interpolate(ms, [sentence.startMs - 250, sentence.startMs], [0, 1], {
        extrapolateLeft: "clamp",
        extrapolateRight: "clamp",
      });
  return (
    <div
      style={{
        position: "absolute",
        left: G.padX,
        top: G.captionTop,
        width: 1180,
        ...DISPLAY,
        fontSize: captionSize(sentence.technical),
        lineHeight: 1.3,
        letterSpacing: "-0.005em",
        opacity,
        textWrap: "pretty",
      }}
    >
      <Words text={sentence.technical} fraction={spokenFraction(sentence, ms)} />
    </div>
  );
}

function describeRef(ref: string): { kind: string; where: string } {
  const [kind, rest = ""] = [ref.slice(0, ref.indexOf(":")), ref.slice(ref.indexOf(":") + 1)];
  if (kind === "diff") {
    const [path, range = ""] = rest.split("#");
    const m = /L(\d+)(?:-L(\d+))?/.exec(range);
    const lines = m ? (m[2] && m[2] !== m[1] ? `${m[1]}–${m[2]}` : m[1]) : "";
    return { kind: "diff", where: `${path} · ${lines}` };
  }
  if (kind === "claim") return { kind: "claim", where: "PR description" };
  if (kind === "task") return { kind: "request", where: `issue #${rest}` };
  if (kind === "map") return { kind: "map", where: "module imports" };
  if (kind === "decision") return { kind: "decision", where: "agent's log" };
  if (kind === "doc") return { kind: "doc", where: rest };
  if (kind === "code") {
    const [path, range = ""] = rest.split("#");
    const m = /L(\d+)(?:-L(\d+))?/.exec(range);
    return {
      kind: "code",
      where: `${path} · ${m ? (m[2] && m[2] !== m[1] ? `${m[1]}–${m[2]}` : m[1]) : ""}`,
    };
  }
  const where = rest.includes(" > ") ? rest.split(" > ").slice(1).join(" > ") : rest;
  return { kind, where: where.length > 34 ? `${where.slice(0, 33)}…` : where };
}

/** Where the words on screen come from. Always visible while a sentence plays. */
export function Source({ sentence }: { sentence: TimelineSentence | null }) {
  if (!sentence) return null;
  const refs = sentence.refs.slice(0, 2).map(describeRef);
  return (
    <div
      style={{
        position: "absolute",
        right: G.padX,
        bottom: 76,
        fontFamily: F.mono,
        fontSize: 22,
        color: C.dust,
        textAlign: "right",
        maxWidth: 460,
        whiteSpace: "nowrap",
      }}
    >
      {refs.map((r, i) => (
        <div key={`${r.kind}${r.where}`} style={{ marginTop: i ? 6 : 0 }}>
          <span style={{ color: C.stone }}>{r.kind}</span> {r.where}
        </div>
      ))}
    </div>
  );
}
