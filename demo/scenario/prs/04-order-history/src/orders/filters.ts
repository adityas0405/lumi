import { matchesSearch } from "./search";
import type { Order, OrderQuery, OrderStatus } from "./types";
import { ORDER_STATUSES } from "./types";

export class InvalidQueryError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidQueryError";
  }
}

export interface NormalizedFilters {
  statuses: Set<OrderStatus> | null;
  fromMs: number | null;
  toMs: number | null;
  minTotalCents: number | null;
  maxTotalCents: number | null;
  search: string;
}

const DATE_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Parses a date bound. Date-only values cover the whole UTC day, so `to: "2026-09-01"`
 * includes orders placed at 23:59 on that day.
 */
function parseBound(value: string, edge: "start" | "end"): number {
  const iso = DATE_ONLY.test(value)
    ? `${value}T${edge === "start" ? "00:00:00.000" : "23:59:59.999"}Z`
    : value;
  const ms = Date.parse(iso);
  if (Number.isNaN(ms)) throw new InvalidQueryError(`Invalid date: ${value}`);
  return ms;
}

function parseAmount(value: number | undefined, label: string): number | null {
  if (value === undefined) return null;
  if (!Number.isInteger(value) || value < 0) {
    throw new InvalidQueryError(`${label} must be a non-negative whole number of cents`);
  }
  return value;
}

export function normalizeFilters(query: OrderQuery): NormalizedFilters {
  const statuses = query.statuses?.length ? new Set(query.statuses) : null;
  for (const s of statuses ?? []) {
    if (!ORDER_STATUSES.includes(s)) throw new InvalidQueryError(`Unknown status: ${s}`);
  }

  const fromMs = query.from ? parseBound(query.from, "start") : null;
  const toMs = query.to ? parseBound(query.to, "end") : null;
  if (fromMs !== null && toMs !== null && fromMs > toMs) {
    throw new InvalidQueryError("`from` must be on or before `to`");
  }

  const minTotalCents = parseAmount(query.minTotalCents, "minTotalCents");
  const maxTotalCents = parseAmount(query.maxTotalCents, "maxTotalCents");
  if (minTotalCents !== null && maxTotalCents !== null && minTotalCents > maxTotalCents) {
    throw new InvalidQueryError("minTotalCents must not exceed maxTotalCents");
  }

  return {
    statuses,
    fromMs,
    toMs,
    minTotalCents,
    maxTotalCents,
    search: (query.search ?? "").trim(),
  };
}

export function matchesFilters(order: Order, f: NormalizedFilters): boolean {
  if (f.statuses && !f.statuses.has(order.status)) return false;
  const placed = Date.parse(order.placedAt);
  if (f.fromMs !== null && placed < f.fromMs) return false;
  if (f.toMs !== null && placed > f.toMs) return false;
  if (f.minTotalCents !== null && order.totalCents < f.minTotalCents) return false;
  if (f.maxTotalCents !== null && order.totalCents > f.maxTotalCents) return false;
  if (f.search && !matchesSearch(order, f.search)) return false;
  return true;
}
