import type { AgentKey } from "./schemas";

export interface Persona {
  key: AgentKey;
  name: string;
  /** Stable colour used across map, inbox, player and video. */
  color: string;
  /** Model family the agent usually runs on; triage picks a different one. */
  modelFamily: "anthropic-opus" | "anthropic-sonnet" | "openai" | "other" | "unknown";
  /** Prefix Lumi adds to review comments so the agent picks the feedback up. */
  mentionPrefix: string | null;
}

export const PERSONAS: Record<AgentKey, Persona> = {
  "claude-code": {
    key: "claude-code",
    name: "Claude Code",
    color: "#B77A5E",
    modelFamily: "anthropic-opus",
    mentionPrefix: "@claude",
  },
  cursor: {
    key: "cursor",
    name: "Cursor",
    color: "#8B9BB3",
    modelFamily: "other",
    mentionPrefix: "@cursor",
  },
  devin: {
    key: "devin",
    name: "Devin",
    color: "#95A585",
    modelFamily: "other",
    mentionPrefix: "@devin-ai-integration",
  },
  unknown: {
    key: "unknown",
    name: "Unknown agent",
    color: "#8C877D",
    modelFamily: "unknown",
    mentionPrefix: null,
  },
};

export interface DetectionInput {
  authorLogin: string | null;
  branch: string | null;
  labels: string[];
  commitMessages: string[];
  body: string;
}

interface Rule {
  agent: Exclude<AgentKey, "unknown">;
  bots: RegExp;
  branch: RegExp;
  trailer: RegExp;
  label: RegExp;
}

const RULES: Rule[] = [
  {
    agent: "claude-code",
    bots: /^(claude|claude-code|anthropic-claude)(\[bot\])?$/i,
    branch: /^(claude|claude-code)[/-]/i,
    trailer: /^Co-Authored-By:\s*Claude\b/im,
    label: /^agent:\s*claude(-code)?$/i,
  },
  {
    agent: "cursor",
    bots: /^cursor(-agent)?(\[bot\])?$/i,
    branch: /^cursor[/-]/i,
    trailer: /^Co-Authored-By:\s*Cursor\b/im,
    label: /^agent:\s*cursor$/i,
  },
  {
    agent: "devin",
    bots: /^devin-ai-integration(\[bot\])?$/i,
    branch: /^devin[/-]/i,
    trailer: /^Co-Authored-By:\s*Devin\b/im,
    label: /^agent:\s*devin$/i,
  },
];

/**
 * Identifies which coding agent produced a pull request. Signals are checked from
 * strongest to weakest: explicit label, bot author, commit trailer, branch prefix.
 */
export function detectAgent(input: DetectionInput): { agent: AgentKey; via: string } {
  for (const rule of RULES) {
    const label = input.labels.find((l) => rule.label.test(l));
    if (label) return { agent: rule.agent, via: `label "${label}"` };
  }
  for (const rule of RULES) {
    if (input.authorLogin && rule.bots.test(input.authorLogin)) {
      return { agent: rule.agent, via: `bot author @${input.authorLogin}` };
    }
  }
  for (const rule of RULES) {
    if (input.commitMessages.some((m) => rule.trailer.test(m))) {
      return { agent: rule.agent, via: "commit trailer" };
    }
  }
  for (const rule of RULES) {
    if (input.branch && rule.branch.test(input.branch)) {
      return { agent: rule.agent, via: `branch "${input.branch}"` };
    }
  }
  return { agent: "unknown", via: "no agent signal" };
}
