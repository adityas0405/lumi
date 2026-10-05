import {
  type AgentKey,
  type Evidence,
  PERSONAS,
  type TaskScript,
  type Timeline,
  tokens,
} from "@lumi/core";
import { createHighlighter, type Highlighter, type ThemeRegistrationRaw } from "shiki";
import type { CodeLine, HunkView, ShotView, TaskVideoProps } from "./props";

/** Restrained code palette: mostly paper and stone, colour only where it helps reading. */
const LUMI_CODE_THEME: ThemeRegistrationRaw = {
  name: "lumi-editorial",
  type: "dark",
  colors: { "editor.background": tokens.color.ink, "editor.foreground": tokens.color.code },
  settings: [
    { settings: { foreground: tokens.color.code, background: tokens.color.ink } },
    {
      scope: ["comment", "punctuation.definition.comment"],
      settings: { foreground: "#6d685e", fontStyle: "italic" },
    },
    {
      scope: ["keyword", "storage", "storage.type", "keyword.operator.new", "keyword.control"],
      settings: { foreground: "#a29c8f" },
    },
    {
      scope: ["string", "string.template", "punctuation.definition.string"],
      settings: { foreground: "#b9aa89" },
    },
    { scope: ["constant.numeric", "constant.language"], settings: { foreground: "#c3a676" } },
    {
      scope: ["entity.name.function", "support.function", "meta.function-call"],
      settings: { foreground: "#ebe6da" },
    },
    {
      scope: ["entity.name.type", "entity.name.class", "support.type", "support.class"],
      settings: { foreground: "#a9b3a3" },
    },
    {
      scope: ["variable.other.property", "meta.object-literal.key"],
      settings: { foreground: "#d6d0c3" },
    },
    { scope: ["keyword.operator", "punctuation"], settings: { foreground: "#8e887c" } },
  ],
};

const LANGS = [
  "typescript",
  "tsx",
  "javascript",
  "css",
  "json",
  "markdown",
  "yaml",
  "python",
] as const;
let highlighter: Promise<Highlighter> | null = null;

function langFor(file: string): (typeof LANGS)[number] | "text" {
  const ext = file.split(".").pop()?.toLowerCase();
  const map: Record<string, (typeof LANGS)[number]> = {
    ts: "typescript",
    mts: "typescript",
    tsx: "tsx",
    js: "javascript",
    mjs: "javascript",
    jsx: "tsx",
    css: "css",
    json: "json",
    md: "markdown",
    yml: "yaml",
    yaml: "yaml",
    py: "python",
  };
  return (ext && map[ext]) || "text";
}

async function highlightHunk(
  file: string,
  lines: {
    type: "add" | "del" | "ctx";
    text: string;
    oldLine: number | null;
    newLine: number | null;
  }[],
): Promise<CodeLine[]> {
  highlighter ??= createHighlighter({ themes: [LUMI_CODE_THEME], langs: [...LANGS] });
  const h = await highlighter;
  const lang = langFor(file);
  const code = lines.map((l) => l.text).join("\n");
  const tokenLines =
    lang === "text"
      ? lines.map((l) => [{ content: l.text, color: tokens.color.code }])
      : h.codeToTokensBase(code, { lang, theme: LUMI_CODE_THEME });
  return lines.map((l, i) => ({
    kind: l.type,
    oldLine: l.oldLine,
    newLine: l.newLine,
    tokens: (tokenLines[i] ?? []).map((t) => ({
      text: t.content,
      color: t.color ?? tokens.color.code,
    })),
  }));
}

export interface BuildPropsInput {
  task: {
    agent: AgentKey;
    prNumber: number | null;
    title: string;
    additions: number;
    deletions: number;
    files: { path: string; additions: number; deletions: number; withheldReason: string | null }[];
  };
  script: TaskScript;
  timeline: Timeline;
  evidence: Evidence[];
  route: "auto_pass" | "needs_human" | "block" | null;
  defectRefs: string[];
  audioSrc: string;
  /** Maps a stored blob path to a URL the renderer's browser can load. */
  assetUrl: (blobPath: string) => string;
}

const KICKERS: Record<string, string> = {
  block: "Lumi review · Blocked by triage",
  needs_human: "Lumi review · Needs your decision",
  auto_pass: "Lumi review · Routine change",
};

export async function buildTaskVideoProps(input: BuildPropsInput): Promise<TaskVideoProps> {
  const persona = PERSONAS[input.task.agent];
  const hunks: HunkView[] = [];
  for (const e of input.evidence) {
    if (e.payload.kind !== "diff_hunk") continue;
    hunks.push({
      ref: e.ref,
      file: e.payload.hunk.file,
      lines: await highlightHunk(e.payload.hunk.file, e.payload.hunk.lines),
    });
  }
  const tests = input.evidence.flatMap((e) =>
    e.payload.kind === "test_case"
      ? [
          {
            ref: e.ref,
            name: e.payload.test.name,
            status: e.payload.test.status,
            message: e.payload.test.message,
          },
        ]
      : [],
  );
  const ci = input.evidence.flatMap((e) =>
    e.payload.kind === "ci_step"
      ? [
          {
            ref: e.ref,
            name: e.payload.step.name,
            conclusion: e.payload.step.conclusion,
            summary: e.payload.step.summary,
          },
        ]
      : [],
  );
  const shots: ShotView[] = input.evidence.flatMap((e) =>
    e.payload.kind === "screenshot" && e.blobPath
      ? [
          {
            ref: e.ref,
            label: e.payload.label,
            variant: e.payload.variant,
            src: input.assetUrl(e.blobPath),
            width: e.payload.width,
            height: e.payload.height,
            highlight: e.payload.highlight,
          },
        ]
      : [],
  );
  const testSummary = ci.find((c) => c.name === "tests")?.summary ?? null;
  const requests = input.evidence.flatMap((e) =>
    e.payload.kind === "task"
      ? [{ ref: e.ref, source: e.payload.source, title: e.payload.title, body: e.payload.body }]
      : [],
  );
  const code = [];
  for (const e of input.evidence) {
    if (e.payload.kind !== "code") continue;
    const highlighted = await highlightHunk(
      e.payload.path,
      e.payload.lines.map((text, i) => ({
        type: "ctx" as const,
        text,
        oldLine: e.payload.kind === "code" ? e.payload.startLine + i : null,
        newLine: null,
      })),
    );
    code.push({
      ref: e.ref,
      path: e.payload.path,
      startLine: e.payload.startLine,
      lines: highlighted.map((l) => l.tokens),
    });
  }
  const mapEvidence = input.evidence.find((e) => e.payload.kind === "module_map");
  const map =
    mapEvidence && mapEvidence.payload.kind === "module_map"
      ? {
          ref: mapEvidence.ref,
          modules: mapEvidence.payload.modules,
          edges: mapEvidence.payload.edges,
        }
      : null;
  const decisions = input.evidence.flatMap((e) =>
    e.payload.kind === "decision"
      ? [
          {
            ref: e.ref,
            title: e.payload.title,
            chosen: e.payload.chosen,
            alternatives: e.payload.alternatives,
            rationale: e.payload.rationale,
          },
        ]
      : [],
  );

  return {
    timeline: input.timeline,
    audioSrc: input.audioSrc,
    meta: {
      agentName: persona.name,
      agentColor: persona.color,
      prNumber: input.task.prNumber,
      title: input.task.title,
      headline: input.script.headline,
      kicker: KICKERS[input.route ?? ""] ?? "Lumi review",
      route: input.route,
      checks: testSummary?.replace(", 0 failed", "").replace(", 0 skipped", "") ?? null,
      testSummary,
      changedLines: input.task.additions + input.task.deletions,
      fileCount: input.task.files.length,
      recommendation: input.script.decision.recommendation,
      recommendationReason: input.script.decision.reason,
    },
    defectRefs: input.defectRefs,
    hunks,
    tests,
    ci: ci.filter((c) => c.name !== "tests"),
    files: input.task.files.map((f) => ({
      path: f.path,
      additions: f.additions,
      deletions: f.deletions,
      withheldReason: f.withheldReason,
    })),
    shots,
    requests,
    code,
    map,
    decisions,
  };
}
