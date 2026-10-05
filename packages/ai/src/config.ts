import { ClaudeCodeProvider } from "./claude-code";
import { GeminiProvider } from "./gemini";
import type { Effort, LlmProvider, Purpose } from "./provider";

interface ModelChoice {
  model: string;
  effort: Effort;
  fallbacks: string[];
}

/**
 * Free-tier friendly: each purpose leads with a different model so their daily
 * quotas (about 20 requests per model on the free tier) don't compete. Lite
 * models are never used for triage: in testing they waved a boundary bug through.
 * On a paid key, point LUMI_MODEL_TRIAGE / LUMI_MODEL_STORY at gemini-3.8-flash.
 */
const DEFAULTS: Record<string, Record<Purpose, ModelChoice>> = {
  // Local development through the developer's own Claude Code login.
  "claude-code": {
    // Sonnet 5.5 by default (lighter on the plan's usage limits); Opus 5.5 as fallback.
    triage: { model: "claude-sonnet-5-5", effort: "high", fallbacks: ["claude-opus-5-5"] },
    story: { model: "claude-sonnet-5-5", effort: "medium", fallbacks: ["claude-opus-5-5"] },
    qa: { model: "claude-sonnet-5-5", effort: "low", fallbacks: ["claude-opus-5-5"] },
    digest: { model: "claude-sonnet-5-5", effort: "medium", fallbacks: ["claude-opus-5-5"] },
  },
  gemini: {
    triage: {
      model: "gemini-3.5-flash",
      effort: "high",
      fallbacks: ["gemini-3-flash-preview", "gemini-3.8-flash"],
    },
    story: {
      model: "gemini-3-flash-preview",
      effort: "medium",
      fallbacks: ["gemini-3.5-flash", "gemini-3.8-flash"],
    },
    // Interactive and grounded in listed evidence: speed matters more than depth.
    qa: {
      model: "gemini-3.1-flash-lite",
      effort: "low",
      fallbacks: ["gemini-3.5-flash-lite", "gemini-3-flash-preview"],
    },
    digest: { model: "gemini-3-flash-preview", effort: "medium", fallbacks: ["gemini-3.5-flash"] },
  },
};

const ENV_MODEL: Record<Purpose, string> = {
  triage: "LUMI_MODEL_TRIAGE",
  story: "LUMI_MODEL_STORY",
  qa: "LUMI_MODEL_QA",
  digest: "LUMI_MODEL_STORY",
};

let provider: LlmProvider | null = null;

export function getProvider(): LlmProvider {
  if (provider) return provider;
  const name = process.env.LUMI_LLM_PROVIDER ?? "gemini";
  let created: LlmProvider;
  if (name === "gemini") created = new GeminiProvider();
  else if (name === "claude-code") created = new ClaudeCodeProvider();
  else throw new Error(`LUMI_LLM_PROVIDER=${name} isn't supported; use "claude-code" or "gemini".`);
  provider = created;
  return created;
}

/**
 * Model for a purpose. `avoidModel` keeps triage independent of the agent that
 * wrote the code: if the reviewer would be the author's own model, the next
 * choice leads instead.
 */
export function modelFor(purpose: Purpose, opts: { avoidModel?: string | null } = {}): ModelChoice {
  const choice = baseChoice(purpose);
  if (!opts.avoidModel || !choice.model.startsWith(opts.avoidModel)) return choice;
  const [next, ...rest] = choice.fallbacks;
  return next ? { ...choice, model: next, fallbacks: [...rest, choice.model] } : choice;
}

function baseChoice(purpose: Purpose): ModelChoice {
  const name = process.env.LUMI_LLM_PROVIDER ?? "gemini";
  const d = DEFAULTS[name]?.[purpose];
  if (!d) throw new Error(`No default model for ${name}/${purpose}`);
  const override = process.env[ENV_MODEL[purpose]];
  if (!override) return d;
  return {
    ...d,
    model: override,
    fallbacks: [d.model, ...d.fallbacks].filter((m) => m !== override),
  };
}

/** Test hook: swap in a fake provider. */
export function setProvider(p: LlmProvider | null): void {
  provider = p;
}
