/** One person's visit history: when they were last seen, and where "since your last visit" starts. */
export interface VisitState {
  lastSeenAt: Date;
  visitStartedAt: Date;
  /** The end of their previous visit: what "since your last visit" counts from. */
  previousVisitAt: Date | null;
}

/** A gap longer than this between page views starts a new visit. */
export const VISIT_GAP_MS = 30 * 60_000;

/**
 * Advances a person's visit state for a page view at `now`. Within a visit, the cut-off
 * stays put, so everything keeps reading "since your last visit" while they work.
 */
export function nextVisit(prev: VisitState | null, now: Date, gapMs = VISIT_GAP_MS): VisitState {
  if (!prev) return { lastSeenAt: now, visitStartedAt: now, previousVisitAt: null };
  if (now.getTime() - prev.lastSeenAt.getTime() > gapMs)
    return { lastSeenAt: now, visitStartedAt: now, previousVisitAt: prev.lastSeenAt };
  return { ...prev, lastSeenAt: now };
}

/** Where "since your last visit" starts: the previous visit's end, or `fallbackDays` ago. */
export function sinceLastVisit(state: VisitState | null, now: Date, fallbackDays = 7): Date {
  return state?.previousVisitAt ?? new Date(now.getTime() - fallbackDays * 86_400_000);
}
