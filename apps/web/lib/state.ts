import type { Health } from "./data";

/** How a state word is coloured: oxide for problems, ochre for waiting on you, quiet otherwise. */
export type Tone = "problem" | "decision" | "working" | "done";

export function toneOf(health: Health): Tone {
  return health === "healthy" ? "done" : health;
}

/** Sort order for the inbox: problems, then decisions, then work in progress, then done. */
export const URGENCY: Record<Health, number> = { problem: 0, decision: 1, working: 2, healthy: 3 };
