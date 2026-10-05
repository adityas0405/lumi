import { describe, expect, it } from "vitest";
import { nextVisit, sinceLastVisit } from "../src/visits";

const t = (min: number) => new Date(Date.UTC(2026, 9, 1, 9, 0) + min * 60_000);

describe("nextVisit", () => {
  it("starts a first visit with no cut-off", () => {
    expect(nextVisit(null, t(0))).toEqual({
      lastSeenAt: t(0),
      visitStartedAt: t(0),
      previousVisitAt: null,
    });
  });

  it("keeps the cut-off while the person keeps working", () => {
    const a = nextVisit(
      { lastSeenAt: t(0), visitStartedAt: t(0), previousVisitAt: t(-600) },
      t(20),
    );
    expect(a.previousVisitAt).toEqual(t(-600));
    expect(nextVisit(a, t(45)).previousVisitAt).toEqual(t(-600));
  });

  it("starts a new visit after a 30-minute gap, counting from the last page view", () => {
    const a = nextVisit({ lastSeenAt: t(0), visitStartedAt: t(-10), previousVisitAt: null }, t(31));
    expect(a).toEqual({ lastSeenAt: t(31), visitStartedAt: t(31), previousVisitAt: t(0) });
  });
});

describe("sinceLastVisit", () => {
  it("falls back to a week ago for someone new", () => {
    expect(sinceLastVisit(null, t(0))).toEqual(new Date(t(0).getTime() - 7 * 86_400_000));
  });
});
