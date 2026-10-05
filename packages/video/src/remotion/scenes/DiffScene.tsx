import type { TimelineSentence } from "@lumi/core";
import { interpolate } from "remotion";
import type { HunkView } from "../../props";
import { focusLines, type LineRange, lineIsDefect } from "../refs";
import { C, F, G } from "../theme";

const STAGE_H = G.stageBottom - G.stageTop - 60;
const CODE_W = 1728;

/** First visible line: keeps every focused line on screen when they fit, with a little context above. */
function windowFor(hunk: HunkView, focus: Set<number>, visible: number): number {
  if (hunk.lines.length <= visible) return 0;
  const idx = focus.size ? [...focus] : [0];
  const first = Math.min(...idx);
  const last = Math.max(...idx);
  const span = last - first + 1;
  const start = span + 2 <= visible ? first - Math.min(2, Math.floor((visible - span) / 2)) : first;
  return Math.max(0, Math.min(start, hunk.lines.length - visible));
}

export function DiffScene({
  hunk,
  sentences,
  ms,
  defectRanges,
}: {
  hunk: HunkView;
  sentences: TimelineSentence[];
  ms: number;
  defectRanges: LineRange[];
}) {
  // Size the code to fit the widest line, within readable limits.
  const widest = Math.max(
    20,
    ...hunk.lines.map((l) => l.tokens.reduce((n, t) => n + t.text.length, 0)),
  );
  const fontSize = Math.max(21, Math.min(30, Math.floor(CODE_W / ((widest + 8) * 0.6))));
  const lineH = Math.round(fontSize * 1.75);
  const visible = Math.max(5, Math.floor(STAGE_H / lineH));
  const maxChars = Math.floor(CODE_W / (fontSize * 0.6)) - 8;

  // Focus follows the sentence being spoken; the window scrolls between them.
  const idx = Math.max(
    0,
    sentences.findLastIndex((s) => s.startMs - 250 <= ms),
  );
  const current = sentences[idx]!;
  const focus = focusLines(hunk, current.refs);
  const prevFocus = idx > 0 ? focusLines(hunk, sentences[idx - 1]!.refs) : focus;
  const from = windowFor(hunk, prevFocus, visible);
  const to = windowFor(hunk, focus, visible);
  const t = interpolate(ms, [current.startMs - 250, current.startMs + 250], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const offset = from + (to - from) * t;

  return (
    <div
      style={{
        position: "absolute",
        left: G.padX,
        right: G.padX,
        top: G.stageTop,
        height: G.stageBottom - G.stageTop,
      }}
    >
      <div style={{ fontFamily: F.mono, fontSize: 22, color: C.stone, marginBottom: 22 }}>
        {hunk.file}
      </div>
      <div style={{ height: visible * lineH, overflow: "hidden", position: "relative" }}>
        <div
          style={{
            transform: `translateY(${-offset * lineH}px)`,
            fontFamily: F.mono,
            fontSize,
            lineHeight: `${lineH}px`,
          }}
        >
          {hunk.lines.map((l, i) => {
            const on = focus.has(i);
            const defect = on && lineIsDefect(l, hunk.file, defectRanges);
            const text = l.tokens.map((tk) => tk.text).join("");
            let used = 0;
            return (
              <div
                // biome-ignore lint/suspicious/noArrayIndexKey: stable line order
                key={i}
                style={{
                  display: "flex",
                  whiteSpace: "pre",
                  opacity: on ? 1 : 0.4,
                  background: defect
                    ? "rgba(197,93,60,0.12)"
                    : on && l.kind === "add"
                      ? "rgba(235,230,218,0.05)"
                      : "transparent",
                  boxShadow: defect
                    ? `inset 5px 0 0 ${C.oxide}`
                    : on && l.kind === "add"
                      ? `inset 3px 0 0 ${C.stone}`
                      : "none",
                }}
              >
                <span
                  style={{
                    width: 84,
                    flex: "none",
                    textAlign: "right",
                    paddingRight: 30,
                    color: defect ? C.oxide : C.dust,
                  }}
                >
                  {l.newLine ?? ""}
                </span>
                <span style={{ width: 34, flex: "none", color: defect ? C.oxide : C.dust }}>
                  {l.kind === "add" ? "+" : l.kind === "del" ? "−" : ""}
                </span>
                <span
                  style={
                    l.kind === "del"
                      ? {
                          color: on ? C.stone : C.dust,
                          textDecoration: on ? "line-through" : "none",
                          textDecorationColor: "rgba(197,93,60,0.7)",
                        }
                      : undefined
                  }
                >
                  {l.tokens.map((tk, k) => {
                    if (used >= maxChars) return null;
                    const room = maxChars - used;
                    const piece =
                      tk.text.length > room
                        ? `${tk.text.slice(0, Math.max(0, room - 1))}…`
                        : tk.text;
                    used += piece.length;
                    return (
                      <span
                        // biome-ignore lint/suspicious/noArrayIndexKey: tokens never reorder
                        key={k}
                        style={{
                          color: l.kind === "del" ? undefined : defect ? C.paper : tk.color,
                        }}
                      >
                        {piece}
                      </span>
                    );
                  })}
                  {text.length === 0 ? " " : null}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
