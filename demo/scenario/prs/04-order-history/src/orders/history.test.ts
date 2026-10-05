import { describe, expect, it } from "vitest";
import { makeOrder } from "./fixtures";
import { lifetimeSpend, queryHistory, sortNewestFirst, summarize } from "./history";
import { sampleOrders } from "./sampleOrders";

describe("queryHistory", () => {
  const orders = sampleOrders(45);

  it("returns the first page newest first", () => {
    const page = queryHistory(orders, { limit: 10 });
    expect(page.orders).toHaveLength(10);
    expect(page.totalMatches).toBe(45);
    const dates = page.orders.map((o) => o.placedAt);
    expect(dates).toEqual([...dates].sort().reverse());
  });

  it("combines filters and reports the match count", () => {
    const page = queryHistory(orders, { statuses: ["refunded"], limit: 100 });
    expect(page.orders.every((o) => o.status === "refunded")).toBe(true);
    expect(page.totalMatches).toBe(page.orders.length);
  });

  it("uses the default page size", () => {
    expect(queryHistory(orders).orders).toHaveLength(20);
  });
});

describe("summarize", () => {
  it("excludes refunded and cancelled orders from spend", () => {
    const s = summarize([
      makeOrder({ totalCents: 1000 }),
      makeOrder({ totalCents: 3000 }),
      makeOrder({ totalCents: 500, status: "refunded" }),
      makeOrder({ totalCents: 700, status: "cancelled" }),
    ]);
    expect(s).toEqual({
      orderCount: 4,
      lifetimeSpendCents: 4000,
      refundedCents: 500,
      averageOrderCents: 2000,
    });
  });

  it("handles an empty history", () => {
    expect(summarize([]).averageOrderCents).toBe(0);
  });
});

describe("deprecated helpers", () => {
  it("still work for existing callers", () => {
    const a = makeOrder({ placedAt: "2026-01-01T00:00:00.000Z", totalCents: 100 });
    const b = makeOrder({ placedAt: "2026-02-01T00:00:00.000Z", totalCents: 200 });
    expect(sortNewestFirst([a, b])[0]).toBe(b);
    expect(lifetimeSpend([a, b])).toBe(300);
  });
});
