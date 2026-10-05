export function clock(ms: number): string {
  const s = Math.max(0, Math.round(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * "3 h ago". `now` is required and comes from the server's render time, so the server
 * and the browser render the same text (a client clock would cause a hydration mismatch).
 */
export function ago(date: Date | string, now: Date | string | number): string {
  const diff = Math.max(0, new Date(now).getTime() - new Date(date).getTime());
  const m = Math.round(diff / 60_000);
  if (m < 1) return "just now";
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return d === 1 ? "yesterday" : `${d} days ago`;
}

/** Lumi's working time zone: dates read the same on the server and in every browser. */
export const TIME_ZONE = "America/Los_Angeles";

/** "Tue 18:02", in Lumi's time zone. */
export function shortTime(date: Date | string): string {
  const d = new Date(date);
  const day = d.toLocaleDateString("en-US", { weekday: "short", timeZone: TIME_ZONE });
  const time = d.toLocaleTimeString("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    timeZone: TIME_ZONE,
  });
  return `${day} ${time}`;
}

export const AGENT_VAR: Record<string, string> = {
  "claude-code": "var(--clay)",
  cursor: "var(--slate)",
  devin: "var(--sage)",
  unknown: "var(--dust)",
};

export const ROUTE_LABEL: Record<string, string> = {
  block: "Blocked by triage",
  needs_human: "Needs a human",
  auto_pass: "Would auto-pass",
};
