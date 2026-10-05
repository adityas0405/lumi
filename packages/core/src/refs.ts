/**
 * Evidence references are stable, human-readable keys that tie every narration
 * sentence to the evidence behind it. The player uses them to show that evidence
 * while the sentence plays.
 *
 *   diff:src/tax.ts#L12-L30      a hunk, or a line range inside one (new-file lines)
 *   file:src/tax.ts              a whole changed file
 *   test:tax > rounds half-even  a test case (suite > name)
 *   ci:unit-tests                a CI check / step
 *   shot:checkout@after          a screenshot (before | after | single)
 *   log:sentry                   a log or trace excerpt
 *   artifact:1                   an agent-produced artifact (video, image, link)
 *   claim:pr-body                what the agent said about its own work (untrusted)
 */

export type ParsedRef =
  | { type: "diff"; path: string; start: number; end: number }
  | { type: "file"; path: string }
  | { type: "test"; name: string }
  | { type: "ci"; name: string }
  | { type: "shot"; label: string; variant: "before" | "after" | "single" }
  | { type: "log"; source: string }
  | { type: "artifact"; id: string }
  | { type: "claim"; id: string }
  | { type: "task"; id: string }
  | { type: "code"; path: string; start: number; end: number }
  | { type: "doc"; path: string }
  | { type: "map"; id: string }
  | { type: "decision"; id: string };

export const refs = {
  diff: (path: string, start: number, end: number) =>
    `diff:${path}#L${start}-L${Math.max(start, end)}`,
  file: (path: string) => `file:${path}`,
  test: (name: string, suite?: string | null) => `test:${suite ? `${suite} > ` : ""}${name}`,
  ci: (name: string) => `ci:${name}`,
  shot: (label: string, variant: "before" | "after" | "single") =>
    variant === "single" ? `shot:${label}` : `shot:${label}@${variant}`,
  log: (source: string) => `log:${source}`,
  artifact: (id: string | number) => `artifact:${id}`,
  claim: (id = "pr-body") => `claim:${id}`,
  task: (id: string | number) => `task:${id}`,
  code: (path: string, start: number, end: number) =>
    `code:${path}#L${start}-L${Math.max(start, end)}`,
  doc: (path: string) => `doc:${path}`,
  map: (id = "modules") => `map:${id}`,
  decision: (id: string | number) => `decision:${id}`,
};

const DIFF_RE = /^diff:(.+)#L(\d+)(?:-L(\d+))?$/;
const CODE_RE = /^code:(.+)#L(\d+)(?:-L(\d+))?$/;

export function parseRef(ref: string): ParsedRef | null {
  const colon = ref.indexOf(":");
  if (colon <= 0) return null;
  const type = ref.slice(0, colon);
  const rest = ref.slice(colon + 1);
  if (!rest) return null;
  switch (type) {
    case "diff": {
      const m = DIFF_RE.exec(ref);
      if (!m) return null;
      const start = Number(m[2]);
      const end = m[3] ? Number(m[3]) : start;
      if (end < start) return null;
      return { type: "diff", path: m[1]!, start, end };
    }
    case "file":
      return { type: "file", path: rest };
    case "test":
      return { type: "test", name: rest };
    case "ci":
      return { type: "ci", name: rest };
    case "shot": {
      const at = rest.lastIndexOf("@");
      if (at === -1) return { type: "shot", label: rest, variant: "single" };
      const variant = rest.slice(at + 1);
      if (variant !== "before" && variant !== "after") return null;
      return { type: "shot", label: rest.slice(0, at), variant };
    }
    case "log":
      return { type: "log", source: rest };
    case "artifact":
      return { type: "artifact", id: rest };
    case "claim":
      return { type: "claim", id: rest };
    case "task":
      return { type: "task", id: rest };
    case "doc":
      return { type: "doc", path: rest };
    case "map":
      return { type: "map", id: rest };
    case "decision":
      return { type: "decision", id: rest };
    case "code": {
      const m = CODE_RE.exec(ref);
      if (!m) return null;
      const start = Number(m[2]);
      const end = m[3] ? Number(m[3]) : start;
      if (end < start) return null;
      return { type: "code", path: m[1]!, start, end };
    }
    default:
      return null;
  }
}
