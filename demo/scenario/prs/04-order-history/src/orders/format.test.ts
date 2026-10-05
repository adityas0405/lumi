import { describe, expect, it } from "vitest";
import { makeOrder } from "./fixtures";
import { formatOrderDate, itemCount, itemSummary } from "./format";

const item = (name: string, quantity = 1) => ({ sku: name, name, quantity, unitCents: 100 });

describe("format", () => {
  it("formats dates in UTC", () => {
    expect(formatOrderDate("2026-09-01T23:30:00.000Z")).toBe("Sep 1, 2026");
  });

  it("summarizes items", () => {
    expect(itemSummary(makeOrder({ items: [] }))).toBe("No items");
    expect(itemSummary(makeOrder({ items: [item("Lamp")] }))).toBe("Lamp");
    expect(itemSummary(makeOrder({ items: [item("Lamp"), item("Mug")] }))).toBe("Lamp and Mug");
    expect(itemSummary(makeOrder({ items: [item("Lamp"), item("Mug"), item("Pen")] }))).toBe(
      "Lamp and 2 more",
    );
  });

  it("counts quantities", () => {
    expect(itemCount(makeOrder({ items: [item("Lamp", 2), item("Mug", 3)] }))).toBe(5);
  });
});
