import { interpolate } from "remotion";
import type { CodeView, DecisionLogView, MapView, TaskRequestView } from "../../props";
import { C, DISPLAY, F, G } from "../theme";

const stage = {
  position: "absolute" as const,
  left: G.padX,
  right: G.padX,
  top: G.stageTop,
  height: G.stageBottom - G.stageTop,
};
const smallCaps = {
  fontFamily: F.sans,
  fontSize: 22,
  letterSpacing: "0.14em",
  textTransform: "uppercase" as const,
};

// ------------------------------------------------------------------ the request

/** What the agent was asked to do, set like a document. */
export function RequestScene({ request }: { request: TaskRequestView }) {
  const body =
    request.body.length > 420 ? `${request.body.slice(0, 419).trimEnd()}…` : request.body;
  return (
    <div style={{ ...stage, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      <div style={{ ...smallCaps, color: C.stone }}>The request · {request.source}</div>
      <div
        style={{
          ...DISPLAY,
          fontSize: 58,
          lineHeight: 1.15,
          marginTop: 22,
          maxWidth: 1500,
          color: C.paper,
          textWrap: "balance",
        }}
      >
        {request.title}
      </div>
      <div
        style={{
          marginTop: 30,
          paddingTop: 26,
          borderTop: `1px solid ${C.rule}`,
          fontFamily: F.sans,
          fontSize: 30,
          lineHeight: 1.5,
          color: C.paperDim,
          maxWidth: 1450,
          whiteSpace: "pre-wrap",
        }}
      >
        {body}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ module map

const BOX_W = 330;
const BOX_H = 92;
const COL_X = [0, 699, 1398];

/**
 * Three columns a reviewer can read at a glance: modules that use the changed
 * code, the changed modules, and what the changed code depends on.
 */
function layout(map: MapView, height: number) {
  const changed = map.modules.filter((m) => m.changed).map((m) => m.id);
  const isChanged = new Set(changed);
  const usedBy = new Set<string>();
  const uses = new Set<string>();
  for (const e of map.edges) {
    if (isChanged.has(e.to) && !isChanged.has(e.from)) usedBy.add(e.from);
    if (isChanged.has(e.from) && !isChanged.has(e.to)) uses.add(e.to);
  }
  for (const id of usedBy) uses.delete(id);
  const cols = [[...usedBy].sort(), changed, [...uses].sort()];
  const pos = new Map<string, { x: number; y: number; col: number }>();
  cols.forEach((members, col) => {
    const gap = height / (members.length + 1);
    members.forEach((id, i) => {
      pos.set(id, { x: COL_X[col]!, y: gap * (i + 1) - BOX_H / 2, col });
    });
  });
  // Only edges that read left to right: a user importing the change, or the change importing a dependency.
  const edges = map.edges.filter((e) => {
    const a = pos.get(e.from);
    const b = pos.get(e.to);
    return a && b && b.col === a.col + 1;
  });
  return { pos, edges, cols };
}

function label(id: string, all: string[]): string {
  const name = id.slice(id.lastIndexOf("/") + 1);
  return all.some((other) => other !== id && other.startsWith(`${id}/`))
    ? `${name} (top level)`
    : name;
}

export function ModuleMapScene({
  map,
  focus,
  ms,
  startMs,
}: {
  map: MapView;
  focus: Set<string>;
  ms: number;
  startMs: number;
}) {
  const width = 1728;
  const height = G.stageBottom - G.stageTop - 110;
  const { pos, edges, cols } = layout(map, height);
  const ids = map.modules.map((m) => m.id);
  const reveal = interpolate(ms, [startMs, startMs + 700], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const lit = (id: string) =>
    focus.size ? focus.has(id) : map.modules.find((m) => m.id === id)?.changed === true;
  const heads = ["Used by", "Changed", "Uses"];
  return (
    <div style={stage}>
      <div style={{ ...smallCaps, color: C.stone }}>
        Where this change sits · from the code's imports
      </div>
      <div style={{ position: "relative", width, height: height + 56, marginTop: 24 }}>
        {heads.map((h, col) =>
          cols[col]!.length ? (
            <div
              key={h}
              style={{
                position: "absolute",
                left: COL_X[col],
                top: 0,
                ...smallCaps,
                fontSize: 19,
                color: C.dust,
              }}
            >
              {h}
            </div>
          ) : null,
        )}
        <div style={{ position: "absolute", left: 0, top: 56, width, height }}>
          <svg
            width={width}
            height={height}
            style={{ position: "absolute", inset: 0, overflow: "visible" }}
          >
            <title>Imports between the modules around this change</title>
            <defs>
              <marker
                id="arrow"
                viewBox="0 0 10 10"
                refX="9"
                refY="5"
                markerWidth="7"
                markerHeight="7"
                orient="auto"
              >
                <path d="M 0 0 L 10 5 L 0 10 z" fill={C.stone} />
              </marker>
            </defs>
            {edges.map((e) => {
              const a = pos.get(e.from)!;
              const b = pos.get(e.to)!;
              const leftToRight = a.x < b.x;
              const x1 = leftToRight ? a.x + BOX_W : a.x;
              const x2 = leftToRight ? b.x - 8 : b.x + BOX_W + 8;
              const y1 = a.y + BOX_H / 2;
              const y2 = b.y + BOX_H / 2;
              const bend = (x2 - x1) / 2;
              const on = lit(e.from) || lit(e.to);
              return (
                <path
                  key={`${e.from}-${e.to}`}
                  d={`M ${x1} ${y1} C ${x1 + bend} ${y1}, ${x2 - bend} ${y2}, ${x2} ${y2}`}
                  fill="none"
                  stroke={on ? C.stone : C.rule}
                  strokeWidth={on ? 2 : 1.5}
                  markerEnd="url(#arrow)"
                  opacity={reveal}
                />
              );
            })}
          </svg>
          {map.modules
            .filter((m) => pos.has(m.id))
            .map((m) => {
              const p = pos.get(m.id)!;
              const on = lit(m.id);
              return (
                <div
                  key={m.id}
                  style={{
                    position: "absolute",
                    left: p.x,
                    top: p.y,
                    width: BOX_W,
                    height: BOX_H,
                    padding: "14px 20px",
                    background: C.ink,
                    border: `1px solid ${on ? C.paper : m.changed ? C.stone : C.rule}`,
                    opacity: on ? 1 : m.changed ? 0.9 : 0.6,
                  }}
                >
                  <div
                    style={{
                      fontFamily: F.mono,
                      fontSize: 27,
                      color: on ? C.paper : C.paperDim,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {label(m.id, ids)}
                  </div>
                  <div
                    style={{
                      fontFamily: F.sans,
                      fontSize: 20,
                      color: C.stone,
                      marginTop: 6,
                      whiteSpace: "nowrap",
                    }}
                  >
                    {m.files} file{m.files === 1 ? "" : "s"}
                    {m.changed ? ` · ${m.changedLines} lines changed` : ""}
                  </div>
                </div>
              );
            })}
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ surrounding code

export function CodeScene({
  code,
  range,
}: {
  code: CodeView;
  range: { start: number; end: number } | null;
}) {
  const visible = 11;
  const lineH = 50;
  const first = range ? Math.max(0, range.start - code.startLine - 3) : 0;
  const start = Math.min(first, Math.max(0, code.lines.length - visible));
  const shown = code.lines.slice(start, start + visible);
  return (
    <div style={stage}>
      <div style={{ fontFamily: F.mono, fontSize: 22, color: C.stone, marginBottom: 22 }}>
        {code.path} <span style={{ color: C.dust }}>· before the change</span>
      </div>
      <div style={{ fontFamily: F.mono, fontSize: 28, lineHeight: `${lineH}px` }}>
        {shown.map((tokens, i) => {
          const n = code.startLine + start + i;
          const on = range ? n >= range.start && n <= range.end : true;
          return (
            <div
              key={n}
              style={{
                display: "flex",
                whiteSpace: "pre",
                opacity: on ? 1 : 0.4,
                boxShadow: on && range ? `inset 3px 0 0 ${C.stone}` : "none",
              }}
            >
              <span
                style={{
                  width: 84,
                  flex: "none",
                  textAlign: "right",
                  paddingRight: 30,
                  color: C.dust,
                }}
              >
                {n}
              </span>
              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                {tokens.map((t, k) => (
                  <span
                    // biome-ignore lint/suspicious/noArrayIndexKey: tokens never reorder
                    key={k}
                    style={{ color: t.color }}
                  >
                    {t.text}
                  </span>
                ))}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ decision log

/** A decision the agent logged: what it chose, set against what it considered. */
export function DecisionLogScene({
  decision,
  agentName,
  agentColor,
}: {
  decision: DecisionLogView;
  agentName: string;
  agentColor: string;
}) {
  return (
    <div
      style={{
        ...stage,
        display: "grid",
        gridTemplateColumns: "1.15fr 1fr",
        gap: 90,
        alignContent: "center",
      }}
    >
      <div>
        <div style={{ ...smallCaps, color: C.stone }}>
          <span style={{ color: agentColor }}>{agentName}</span>'s decision log · {decision.title}
        </div>
        <div
          style={{
            ...DISPLAY,
            fontSize: 50,
            lineHeight: 1.22,
            marginTop: 22,
            color: C.paper,
            textWrap: "pretty",
          }}
        >
          {decision.chosen}
        </div>
        <div
          style={{
            fontFamily: F.sans,
            fontSize: 27,
            lineHeight: 1.5,
            marginTop: 24,
            color: C.stone,
            textWrap: "pretty",
          }}
        >
          {decision.rationale}
        </div>
      </div>
      <div style={{ alignSelf: "center" }}>
        <div style={{ ...smallCaps, color: C.dust, marginBottom: 10 }}>Considered instead</div>
        {decision.alternatives.length === 0 ? (
          <div
            style={{
              fontFamily: F.sans,
              fontSize: 28,
              color: C.dust,
              paddingTop: 14,
              borderTop: `1px solid ${C.rule}`,
            }}
          >
            None recorded
          </div>
        ) : (
          decision.alternatives.map((a) => (
            <div
              key={a}
              style={{
                fontFamily: F.sans,
                fontSize: 29,
                lineHeight: 1.4,
                color: C.paperDim,
                padding: "16px 0",
                borderTop: `1px solid ${C.rule}`,
              }}
            >
              {a}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
