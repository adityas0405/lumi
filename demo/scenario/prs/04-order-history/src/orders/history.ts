import type { Cents } from "../money";
import { matchesFilters, normalizeFilters } from "./filters";
import { clampPageSize, compareOrders, paginate } from "./pagination";
import type { HistorySummary, Order, OrderPage, OrderQuery } from "./types";

/**
 * Filters, sorts and paginates a customer's orders. Throws InvalidQueryError or
 * InvalidCursorError for bad input so the API layer can return a 400.
 */
export function queryHistory(orders: Order[], query: OrderQuery = {}): OrderPage {
  const filters = normalizeFilters(query);
  const sort = query.sort ?? "newest";
  const matching = orders
    .filter((o) => matchesFilters(o, filters))
    .sort((a, b) => compareOrders(a, b, sort));
  const { page, nextCursor } = paginate(matching, sort, clampPageSize(query.limit), query.cursor);
  return { orders: page, nextCursor, totalMatches: matching.length };
}

/** Refunded and cancelled orders don't count towards lifetime spend. */
export function summarize(orders: Order[]): HistorySummary {
  const counted = orders.filter((o) => o.status !== "refunded" && o.status !== "cancelled");
  const lifetimeSpendCents = counted.reduce((s, o) => s + o.totalCents, 0);
  const refundedCents = orders
    .filter((o) => o.status === "refunded")
    .reduce((s, o) => s + o.totalCents, 0);
  return {
    orderCount: orders.length,
    lifetimeSpendCents,
    refundedCents,
    averageOrderCents: counted.length ? Math.round(lifetimeSpendCents / counted.length) : 0,
  };
}

/** @deprecated Use queryHistory(orders, { sort: "newest" }). Kept for existing callers. */
export function sortNewestFirst(orders: Order[]): Order[] {
  return [...orders].sort((a, b) => compareOrders(a, b, "newest"));
}

/** @deprecated Use summarize(orders).lifetimeSpendCents. Kept for existing callers. */
export function lifetimeSpend(orders: Order[]): Cents {
  return summarize(orders).lifetimeSpendCents;
}
