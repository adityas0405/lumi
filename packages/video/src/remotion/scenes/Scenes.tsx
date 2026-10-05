import type { TimelineSentence } from "@lumi/core";
import { Img, interpolate } from "remotion";
import type { CiView, FileView, HunkView, ShotView, TaskVideoProps, TestView } from "../../props";
import { Words } from "../chrome/Words";
import { focusLines } from "../refs";
import { C, DISPLAY, F, G } from "../theme";
import { spokenFraction } from "../timing";

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

// ------------------------------------------------------------------ title

const ROUTE_LABEL = {
  block: "Block",
  needs_human: "Needs a human",
  auto_pass: "Would auto-pass",
} as const;

export function TitleCard({ meta }: { meta: TaskVideoProps["meta"] }) {
  const facts = [
    { k: "Agent", v: meta.agentName, color: meta.agentColor },
    {
      k: "Change",
      v: `${meta.prNumber ? `PR #${meta.prNumber} · ` : ""}${meta.changedLines} lines`,
    },
    ...(meta.checks ? [{ k: "Checks", v: meta.checks.replace(/,/g, " ·") }] : []),
    ...(meta.route
      ? [
          {
            k: "Triage",
            v: ROUTE_LABEL[meta.route],
            color: meta.route === "block" ? C.oxide : C.paper,
          },
        ]
      : []),
  ];
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        padding: `${G.top}px ${G.padX}px 80px`,
        display: "flex",
        flexDirection: "column",
      }}
    >
      <div style={{ ...smallCaps, fontSize: 25, color: C.stone }}>{meta.kicker}</div>
      <div
        style={{
          ...DISPLAY,
          fontSize: 98,
          lineHeight: 1.08,
          letterSpacing: "-0.012em",
          marginTop: 60,
          maxWidth: 1560,
          color: C.paper,
          textWrap: "balance",
        }}
      >
        {meta.headline}
      </div>
      <div
        style={{
          marginTop: "auto",
          display: "flex",
          gap: 86,
          borderTop: `1px solid ${C.rule}`,
          paddingTop: 30,
          fontFamily: F.sans,
        }}
      >
        {facts.map((f) => (
          <div key={f.k} style={{ fontSize: 26, color: C.stone }}>
            {f.k}
            <div style={{ fontSize: 33, fontWeight: 500, marginTop: 6, color: f.color ?? C.paper }}>
              {f.v}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ the agent's words

export function ClaimScene({
  sentence,
  ms,
  meta,
}: {
  sentence: TimelineSentence;
  ms: number;
  meta: TaskVideoProps["meta"];
}) {
  return (
    <div
      style={{
        ...stage,
        display: "flex",
        flexDirection: "column",
        justifyContent: "center",
        paddingBottom: 40,
      }}
    >
      <div
        style={{
          ...DISPLAY,
          fontStyle: "italic",
          fontSize: 66,
          lineHeight: 1.24,
          maxWidth: 1500,
          textWrap: "pretty",
        }}
      >
        <span style={{ color: meta.agentColor }}>“</span>
        <Words
          text={sentence.technical}
          fraction={spokenFraction(sentence, ms)}
          lit={C.paper}
          unlit={C.dust}
        />
        <span style={{ color: meta.agentColor }}>”</span>
      </div>
      <div style={{ marginTop: 36, fontFamily: F.sans, fontSize: 27, color: C.stone }}>
        <span style={{ color: meta.agentColor, fontWeight: 500 }}>{meta.agentName}</span>, in its
        own words · from the PR description, not verified by Lumi
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ uncertainty

export function UncertainScene({
  sentence,
  ms,
  label,
  tone = "ochre",
}: {
  sentence: TimelineSentence;
  ms: number;
  label?: string;
  tone?: "ochre" | "stone";
}) {
  const text = label ?? (sentence.confidence === "untested" ? "Not tested" : "Uncertain");
  const color = tone === "ochre" ? C.ochre : C.stone;
  return (
    <div style={{ ...stage, display: "flex", alignItems: "center" }}>
      <div style={{ borderLeft: `2px solid ${color}`, paddingLeft: 44, maxWidth: 1450 }}>
        <div style={{ ...smallCaps, color, marginBottom: 26 }}>{text}</div>
        <div style={{ ...DISPLAY, fontSize: 60, lineHeight: 1.26, textWrap: "pretty" }}>
          <Words
            text={sentence.technical}
            fraction={spokenFraction(sentence, ms)}
            lit={C.paper}
            unlit={C.dust}
          />
        </div>
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ tests

const GLYPH = { passed: "✓", failed: "✗", skipped: "○" } as const;

export function TestsScene({ tests, cited }: { tests: TestView[]; cited: string[] }) {
  const passed = tests.filter((t) => t.status === "passed").length;
  const skipped = tests.filter((t) => t.status === "skipped").length;
  const failed = tests.filter((t) => t.status === "failed").length;
  // Cited and problem tests first, then the rest, up to what fits.
  const ordered = [...tests].sort((a, b) => score(b) - score(a)).slice(0, 7);
  function score(t: TestView) {
    return (
      (cited.includes(t.ref) ? 4 : 0) +
      (t.status === "failed" ? 2 : 0) +
      (t.status === "skipped" ? 1 : 0)
    );
  }
  return (
    <div style={stage}>
      <div style={{ ...smallCaps, color: C.stone }}>
        Tests in the changed files · {passed} passed{failed ? ` · ${failed} failed` : ""}
        {skipped ? ` · ${skipped} skipped` : ""}
      </div>
      <div style={{ marginTop: 26 }}>
        {ordered.map((t) => {
          const on = cited.includes(t.ref);
          const color =
            t.status === "failed"
              ? C.oxide
              : t.status === "skipped"
                ? C.ochre
                : on
                  ? C.paper
                  : C.stone;
          return (
            <div
              key={t.ref}
              style={{
                display: "grid",
                gridTemplateColumns: "56px 1fr auto",
                alignItems: "baseline",
                padding: "15px 0",
                borderTop: `1px solid ${C.rule}`,
                fontFamily: F.sans,
                fontSize: 31,
                color: on ? C.paper : C.dust,
              }}
            >
              <span style={{ color, fontFamily: F.mono }}>{GLYPH[t.status]}</span>
              <span style={{ whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                {t.name}
              </span>
              <span style={{ ...smallCaps, fontSize: 19, color, marginLeft: 24 }}>
                {t.status === "passed" ? "" : t.status}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ CI

export function CiScene({ ci, testSummary }: { ci: CiView[]; testSummary: string | null }) {
  const nums = testSummary?.match(/(\d+) passed, (\d+) failed, (\d+) skipped/);
  const steps = ci.filter((c) => c.name.includes(" / ")).slice(0, 5);
  return (
    <div
      style={{
        ...stage,
        display: "grid",
        gridTemplateColumns: "1fr 1fr",
        gap: 110,
        alignItems: "center",
      }}
    >
      <div>
        <div style={{ ...smallCaps, color: C.stone, marginBottom: 20 }}>Test run</div>
        {nums ? (
          <div style={{ display: "flex", gap: 56, ...DISPLAY }}>
            {[
              ["passed", nums[1], C.paper],
              ["failed", nums[2], Number(nums[2]) ? C.oxide : C.dust],
              ["skipped", nums[3], Number(nums[3]) ? C.ochre : C.dust],
            ].map(([k, v, color]) => (
              <div key={k}>
                <div style={{ fontSize: 132, lineHeight: 1, color }}>{v}</div>
                <div style={{ fontFamily: F.sans, fontSize: 27, color: C.stone, marginTop: 10 }}>
                  {k}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div style={{ ...DISPLAY, fontSize: 60, color: C.stone }}>No test results</div>
        )}
      </div>
      <div>
        <div style={{ ...smallCaps, color: C.stone, marginBottom: 12 }}>CI steps</div>
        {steps.map((s) => (
          <div
            key={s.ref}
            style={{
              display: "flex",
              justifyContent: "space-between",
              padding: "14px 0",
              borderTop: `1px solid ${C.rule}`,
              fontFamily: F.sans,
              fontSize: 28,
            }}
          >
            <span style={{ color: C.paperDim }}>{s.name.split(" / ").pop()}</span>
            <span
              style={{
                color:
                  s.conclusion === "success"
                    ? C.stone
                    : s.conclusion === "failure"
                      ? C.oxide
                      : C.ochre,
              }}
            >
              {s.conclusion}
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ files

export function FilesScene({ files }: { files: FileView[] }) {
  const shown = files.slice(0, 8);
  const max = Math.max(1, ...shown.map((f) => f.additions + f.deletions));
  return (
    <div style={stage}>
      <div style={{ ...smallCaps, color: C.stone }}>
        {files.length} files changed · +{files.reduce((n, f) => n + f.additions, 0)} −
        {files.reduce((n, f) => n + f.deletions, 0)}
      </div>
      <div style={{ marginTop: 24 }}>
        {shown.map((f) => (
          <div
            key={f.path}
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 150px 360px",
              alignItems: "center",
              padding: "12px 0",
              borderTop: `1px solid ${C.rule}`,
            }}
          >
            <span
              style={{
                fontFamily: F.mono,
                fontSize: 27,
                color: f.withheldReason ? C.dust : C.paperDim,
              }}
            >
              {f.path}
            </span>
            <span
              style={{
                fontFamily: F.mono,
                fontSize: 23,
                color: C.stone,
                textAlign: "right",
                paddingRight: 28,
              }}
            >
              +{f.additions} −{f.deletions}
            </span>
            <span style={{ display: "flex", height: 6 }}>
              <span style={{ width: `${(f.additions / max) * 100}%`, background: C.paperDim }} />
              <span style={{ width: `${(f.deletions / max) * 100}%`, background: C.dust }} />
            </span>
          </div>
        ))}
        {files.length > shown.length && (
          <div style={{ fontFamily: F.sans, fontSize: 24, color: C.dust, paddingTop: 12 }}>
            and {files.length - shown.length} more
          </div>
        )}
      </div>
    </div>
  );
}

// ------------------------------------------------------------------ before / after

export function BeforeAfterScene({
  hunk,
  sentence,
  shots,
}: {
  hunk: HunkView | null;
  sentence: TimelineSentence;
  shots: ShotView[];
}) {
  const before = shots.find((s) => s.variant === "before");
  const after = shots.find((s) => s.variant === "after");
  if (before && after) {
    return (
      <div style={{ ...stage, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 48 }}>
        {[before, after].map((s) => (
          <div key={s.ref} style={{ minHeight: 0 }}>
            <div style={{ ...smallCaps, color: C.stone, marginBottom: 14 }}>{s.variant}</div>
            {/* Same crop on both sides, centred on what changed, so they compare directly. */}
            <ShotFrame
              shot={s}
              maxW={840}
              maxH={G.stageBottom - G.stageTop - 60}
              crop={cropFor(s, after.highlight)}
              showBox={s.variant === "after"}
            />
          </div>
        ))}
      </div>
    );
  }
  if (!hunk) return null;
  // Without screenshots: the old line against the new one, in large type.
  const focus = focusLines(hunk, sentence.refs);
  const lines = hunk.lines.filter((_, i) => focus.has(i));
  const del = lines.filter((l) => l.kind === "del").slice(0, 3);
  const add = lines.filter((l) => l.kind === "add").slice(0, 3);
  const row = (label: string, ls: typeof lines, color: string, strike: boolean) => (
    <div style={{ padding: "26px 0", borderTop: `1px solid ${C.rule}` }}>
      <div style={{ ...smallCaps, color: C.stone, marginBottom: 16 }}>{label}</div>
      {ls.map((l, i) => (
        <div
          // biome-ignore lint/suspicious/noArrayIndexKey: order
          key={i}
          style={{
            fontFamily: F.mono,
            fontSize: 34,
            color,
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            textDecoration: strike ? "line-through" : "none",
            textDecorationColor: "rgba(197,93,60,0.6)",
          }}
        >
          {l.tokens
            .map((t) => t.text)
            .join("")
            .trim()}
        </div>
      ))}
    </div>
  );
  return (
    <div style={{ ...stage, display: "flex", flexDirection: "column", justifyContent: "center" }}>
      {del.length > 0 && row("Before", del, C.dust, true)}
      {add.length > 0 && row("After", add, C.paper, false)}
    </div>
  );
}

// ------------------------------------------------------------------ screenshot

/** The region to show: the changed area with generous context, else the whole page. */
function cropFor(
  shot: ShotView,
  highlight: ShotView["highlight"],
): { x: number; y: number; w: number; h: number } {
  if (!highlight) return { x: 0, y: 0, w: shot.width, h: shot.height };
  const w = Math.min(shot.width, Math.max(highlight.w * 2.4, 720));
  const h = Math.min(shot.height, w * (10 / 16));
  const cx = highlight.x + highlight.w / 2;
  const cy = highlight.y + highlight.h / 2;
  const x = Math.max(0, Math.min(shot.width - w, cx - w / 2));
  const y = Math.max(0, Math.min(shot.height - h, cy - h / 2));
  return { x, y, w, h };
}

function ShotFrame({
  shot,
  maxW,
  maxH,
  crop,
  showBox,
}: {
  shot: ShotView;
  maxW: number;
  maxH: number;
  crop: { x: number; y: number; w: number; h: number };
  showBox: boolean;
}) {
  const scale = Math.min(maxW / crop.w, maxH / crop.h);
  const hl = shot.highlight;
  return (
    <div
      style={{
        position: "relative",
        width: crop.w * scale,
        height: crop.h * scale,
        overflow: "hidden",
        outline: `1px solid ${C.rule}`,
      }}
    >
      <Img
        src={shot.src}
        style={{
          position: "absolute",
          left: -crop.x * scale,
          top: -crop.y * scale,
          width: shot.width * scale,
          height: shot.height * scale,
        }}
      />
      {showBox && hl && (
        <div
          style={{
            position: "absolute",
            left: (hl.x - crop.x) * scale - 10,
            top: (hl.y - crop.y) * scale - 10,
            width: hl.w * scale + 20,
            height: hl.h * scale + 20,
            border: `3px solid ${C.oxide}`,
          }}
        />
      )}
    </div>
  );
}

export function ScreenshotScene({ shot }: { shot: ShotView }) {
  return (
    <div style={{ ...stage, display: "flex", justifyContent: "center" }}>
      <ShotFrame
        shot={shot}
        maxW={1728}
        maxH={G.stageBottom - G.stageTop}
        crop={cropFor(shot, shot.highlight)}
        showBox
      />
    </div>
  );
}

// ------------------------------------------------------------------ decision

const REC_LABEL = {
  approve: "approve",
  request_changes: "request changes",
  reject: "reject",
  needs_discussion: "discuss before merging",
} as const;

export function DecisionScene({
  meta,
  ms,
  sentenceStart,
}: {
  meta: TaskVideoProps["meta"];
  ms: number;
  sentenceStart: number;
}) {
  const t = interpolate(ms, [sentenceStart, sentenceStart + 600], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const recColor =
    meta.recommendation === "approve"
      ? C.paper
      : meta.recommendation === "needs_discussion"
        ? C.ochre
        : C.oxide;
  return (
    <div style={{ ...stage, display: "flex", flexDirection: "column" }}>
      <div style={{ ...DISPLAY, fontSize: 82, lineHeight: 1.1 }}>
        Recommendation: <span style={{ color: recColor }}>{REC_LABEL[meta.recommendation]}</span>
      </div>
      <div
        style={{
          marginTop: 36,
          paddingTop: 28,
          borderTop: `1px solid ${C.rule}`,
          fontFamily: F.sans,
          fontSize: 36,
          lineHeight: 1.42,
          color: C.paperDim,
          maxWidth: 1500,
          opacity: t,
          textWrap: "pretty",
        }}
      >
        {meta.recommendationReason}
      </div>
    </div>
  );
}
