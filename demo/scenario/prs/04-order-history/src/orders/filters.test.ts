import { describe, expect, it } from "vitest";
import { InvalidQueryError, matchesFilters, normalizeFilters } from "./filters";
import { makeOrder } from "./fixtures";

const check = (query: Parameters<typeof normalizeFilters>[0], over = {}) =>
  matchesFilters(makeOrder(over), normalizeFilters(query));

describe("normalizeFilters", () => {
  it("treats an empty query as match-all", () => {
    expect(check({})).toBe(true);
  });

  it("rejects unknown statuses", () => {
    expect(() => normalizeFilters({ statuses: ["lost" as never] })).toThrow(InvalidQueryError);
  });

  it("rejects inverted date ranges", () => {
    expect(() => normalizeFilters({ from: "2026-09-02", to: "2026-09-01" })).toThrow(
      /on or before/,
    );
  });

  it("rejects invalid dates", () => {
    expect(() => normalizeFilters({ from: "yesterday" })).toThrow(/Invalid date/);
  });

  it("rejects fractional and negative amounts", () => {
    expect(() => normalizeFilters({ minTotalCents: 10.5 })).toThrow(/whole number/);
    expect(() => normalizeFilters({ maxTotalCents: -1 })).toThrow(/whole number/);
  });

  it("rejects min above max", () => {
    expect(() => normalizeFilters({ minTotalCents: 500, maxTotalCents: 100 })).toThrow(/exceed/);
  });
});

describe("matchesFilters", () => {
  it("filters by status", () => {
    expect(check({ statuses: ["refunded"] }, { status: "refunded" })).toBe(true);
    expect(check({ statuses: ["refunded"] }, { status: "delivered" })).toBe(false);
  });

  it("includes the whole day for date-only bounds", () => {
    const late = { placedAt: "2026-09-01T23:59:00.000Z" };
    expect(check({ to: "2026-09-01" }, late)).toBe(true);
    expect(check({ from: "2026-09-02" }, late)).toBe(false);
  });

  it("filters by total, inclusive at both ends", () => {
    expect(check({ minTotalCents: 5000, maxTotalCents: 5000 }, { totalCents: 5000 })).toBe(true);
    expect(check({ minTotalCents: 5001 }, { totalCents: 5000 })).toBe(false);
  });

  it("applies search", () => {
    expect(check({ search: "mug" })).toBe(true);
    expect(check({ search: "lamp" })).toBe(false);
  });
});
