import { describe, expect, it } from "vitest";
import { makeOrder } from "./fixtures";
import {
  clampPageSize,
  compareOrders,
  DEFAULT_PAGE_SIZE,
  decodeCursor,
  encodeCursor,
  InvalidCursorError,
  MAX_PAGE_SIZE,
  paginate,
} from "./pagination";

const orders = Array.from({ length: 7 }, (_, i) =>
  makeOrder({ placedAt: `2026-09-0${i + 1}T10:00:00.000Z`, totalCents: 1000 * ((i % 3) + 1) }),
);

describe("compareOrders", () => {
  it("sorts newest first and breaks ties by id", () => {
    const sorted = [...orders].sort((a, b) => compareOrders(a, b, "newest"));
    expect(sorted[0]!.placedAt).toBe("2026-09-07T10:00:00.000Z");
    const byTotal = [...orders].sort((a, b) => compareOrders(a, b, "total_desc"));
    const threes = byTotal.filter((o) => o.totalCents === 3000).map((o) => o.id);
    expect(threes).toEqual([...threes].sort());
  });
});

describe("paginate", () => {
  const sorted = [...orders].sort((a, b) => compareOrders(a, b, "newest"));

  it("walks every order exactly once", () => {
    const seen: string[] = [];
    let cursor: string | null = null;
    do {
      const { page, nextCursor } = paginate(sorted, "newest", 3, cursor);
      seen.push(...page.map((o) => o.id));
      cursor = nextCursor;
    } while (cursor);
    expect(seen).toEqual(sorted.map((o) => o.id));
  });

  it("returns no cursor on the last page", () => {
    expect(paginate(sorted, "newest", 10, null).nextCursor).toBeNull();
  });

  it("stays stable when a newer order arrives between pages", () => {
    const first = paginate(sorted, "newest", 3, null);
    const newer = makeOrder({ placedAt: "2026-09-30T10:00:00.000Z" });
    const second = paginate([newer, ...sorted], "newest", 3, first.nextCursor);
    expect(second.page[0]!.id).toBe(sorted[3]!.id);
  });

  it("paginates by total", () => {
    const byTotal = [...orders].sort((a, b) => compareOrders(a, b, "total_asc"));
    const first = paginate(byTotal, "total_asc", 4, null);
    const second = paginate(byTotal, "total_asc", 4, first.nextCursor);
    expect([...first.page, ...second.page].map((o) => o.id)).toEqual(byTotal.map((o) => o.id));
  });
});

describe("cursors", () => {
  it("round-trips", () => {
    const c = encodeCursor(orders[0]!, "newest");
    expect(decodeCursor(c, "newest")).toMatchObject({ id: orders[0]!.id });
  });

  it("rejects cursors from another sort or garbage", () => {
    const c = encodeCursor(orders[0]!, "newest");
    expect(() => decodeCursor(c, "oldest")).toThrow(InvalidCursorError);
    expect(() => decodeCursor("not-base64!", "newest")).toThrow(InvalidCursorError);
  });

  it("clamps page size", () => {
    expect(clampPageSize(undefined)).toBe(DEFAULT_PAGE_SIZE);
    expect(clampPageSize(0)).toBe(DEFAULT_PAGE_SIZE);
    expect(clampPageSize(10_000)).toBe(MAX_PAGE_SIZE);
  });
});
