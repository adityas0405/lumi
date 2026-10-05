import type { Order, OrderSort } from "./types";

export const DEFAULT_PAGE_SIZE = 20;
export const MAX_PAGE_SIZE = 100;

interface CursorPayload {
  sort: OrderSort;
  /** Sort value of the last order on the previous page. */
  value: string | number;
  id: string;
}

export class InvalidCursorError extends Error {
  constructor() {
    super("Cursor is invalid or was issued for a different sort order");
    this.name = "InvalidCursorError";
  }
}

export function sortValue(order: Order, sort: OrderSort): string | number {
  return sort === "newest" || sort === "oldest" ? order.placedAt : order.totalCents;
}

/** Total ordering: sort value first, order id as the tie-breaker. */
export function compareOrders(a: Order, b: Order, sort: OrderSort): number {
  const va = sortValue(a, sort);
  const vb = sortValue(b, sort);
  const direction = sort === "newest" || sort === "total_desc" ? -1 : 1;
  if (va < vb) return -1 * direction;
  if (va > vb) return 1 * direction;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}

export function encodeCursor(order: Order, sort: OrderSort): string {
  const payload: CursorPayload = { sort, value: sortValue(order, sort), id: order.id };
  return btoa(JSON.stringify(payload)).replace(/=+$/, "");
}

export function decodeCursor(cursor: string, sort: OrderSort): CursorPayload {
  let payload: CursorPayload;
  try {
    payload = JSON.parse(atob(cursor)) as CursorPayload;
  } catch {
    throw new InvalidCursorError();
  }
  if (payload.sort !== sort || typeof payload.id !== "string") throw new InvalidCursorError();
  return payload;
}

export function clampPageSize(limit: number | undefined): number {
  if (limit === undefined) return DEFAULT_PAGE_SIZE;
  if (!Number.isInteger(limit) || limit < 1) return DEFAULT_PAGE_SIZE;
  return Math.min(limit, MAX_PAGE_SIZE);
}

/**
 * Keyset pagination over an already sorted list. Using the last seen (value, id)
 * instead of an offset keeps pages stable when new orders arrive between requests.
 */
export function paginate(
  sorted: Order[],
  sort: OrderSort,
  limit: number,
  cursor: string | null | undefined,
): { page: Order[]; nextCursor: string | null } {
  let start = 0;
  if (cursor) {
    const after = decodeCursor(cursor, sort);
    const anchor = { id: after.id, placedAt: String(after.value), totalCents: Number(after.value) };
    start = sorted.findIndex((o) => compareOrders(o, anchor as Order, sort) > 0);
    if (start === -1) start = sorted.length;
  }
  const page = sorted.slice(start, start + limit);
  const last = page.at(-1);
  const hasMore = start + limit < sorted.length;
  return { page, nextCursor: hasMore && last ? encodeCursor(last, sort) : null };
}
