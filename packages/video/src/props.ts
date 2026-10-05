import type { Timeline } from "@lumi/core";

/** One syntax-highlighted token. Colours are resolved before render. */
export interface CodeToken {
  text: string;
  color: string;
}

export interface CodeLine {
  kind: "add" | "del" | "ctx";
  oldLine: number | null;
  newLine: number | null;
  tokens: CodeToken[];
}

export interface HunkView {
  ref: string;
  file: string;
  lines: CodeLine[];
}

export interface TestView {
  ref: string;
  name: string;
  status: "passed" | "failed" | "skipped";
  message: string | null;
}

export interface CiView {
  ref: string;
  name: string;
  conclusion: string;
  summary: string | null;
}

export interface FileView {
  path: string;
  additions: number;
  deletions: number;
  withheldReason: string | null;
}

export interface ShotView {
  ref: string;
  label: string;
  variant: "before" | "after" | "single";
  src: string;
  width: number;
  height: number;
  highlight: { x: number; y: number; w: number; h: number } | null;
}

export interface TaskRequestView {
  ref: string;
  source: string;
  title: string;
  body: string;
}

export interface CodeView {
  ref: string;
  path: string;
  startLine: number;
  lines: CodeToken[][];
}

export interface MapView {
  ref: string;
  modules: { id: string; files: number; changed: boolean; changedLines: number }[];
  edges: { from: string; to: string }[];
}

export interface DecisionLogView {
  ref: string;
  title: string;
  chosen: string;
  alternatives: string[];
  rationale: string;
}

/** Everything a task video needs. Plain JSON: Remotion serializes it into the page. */
export interface TaskVideoProps {
  [key: string]: unknown;
  timeline: Timeline;
  audioSrc: string;
  meta: {
    agentName: string;
    agentColor: string;
    prNumber: number | null;
    title: string;
    headline: string;
    kicker: string;
    route: "auto_pass" | "needs_human" | "block" | null;
    checks: string | null;
    /** "26 passed, 0 failed, 1 skipped" as reported by CI. */
    testSummary: string | null;
    changedLines: number;
    fileCount: number;
    recommendation: "approve" | "request_changes" | "reject" | "needs_discussion";
    recommendationReason: string;
  };
  /** Refs the triage reviewer tied to suspected defects; those lines are marked in oxide. */
  defectRefs: string[];
  hunks: HunkView[];
  tests: TestView[];
  ci: CiView[];
  files: FileView[];
  shots: ShotView[];
  requests: TaskRequestView[];
  code: CodeView[];
  map: MapView | null;
  decisions: DecisionLogView[];
}

export interface DigestItemView {
  taskId: string;
  section: "decisions" | "problems" | "highlights";
  agentName: string;
  agentColor: string;
  prNumber: number | null;
  headline: string;
  recommendation: string;
  reviewDurationMs: number | null;
  /** Who asked for the work and for what, e.g. "Asked by @ada · Issue #12, Stop double refunds". */
  request?: { label: string; linked: boolean };
}

/** Everything the daily digest video needs. */
export interface DigestVideoProps {
  [key: string]: unknown;
  timeline: import("@lumi/core").Timeline;
  audioSrc: string;
  meta: {
    dateLabel: string;
    repo: string;
    counts: { decisions: number; problems: number; done: number };
  };
  items: DigestItemView[];
  routine: { agentName: string; title: string }[];
}

export const FPS = 30;
export const WIDTH = 1920;
export const HEIGHT = 1080;
