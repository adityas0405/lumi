import { describe, expect, it } from "vitest";
import { addLine, type Cart, MAX_QUANTITY, removeLine, subtotal } from "./cart";

const empty: Cart = { id: "c", region: "NY", lines: [], coupon: null, shippingMethod: "standard" };

describe("cart", () => {
  it("merges quantities for the same SKU", () => {
    const c = addLine(addLine(empty, "NW-MUG"), "NW-MUG", 2);
    expect(c.lines).toEqual([{ sku: "NW-MUG", quantity: 3 }]);
    expect(subtotal(c)).toBe(7200);
  });

  it("caps quantity per item", () => {
    expect(() => addLine(empty, "NW-MUG", MAX_QUANTITY + 1)).toThrow(/At most/);
  });

  it("removes lines", () => {
    expect(removeLine(addLine(empty, "NW-MUG"), "NW-MUG").lines).toEqual([]);
  });
});
