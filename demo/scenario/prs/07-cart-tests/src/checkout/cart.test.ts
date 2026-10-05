import { describe, expect, it } from "vitest";
import { addLine, type Cart, MAX_QUANTITY, removeLine, subtotal, totalWeight } from "./cart";

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

  it("caps quantity across repeated adds", () => {
    const full = addLine(empty, "NW-MUG", MAX_QUANTITY);
    expect(() => addLine(full, "NW-MUG")).toThrow(/At most/);
  });

  it("rejects zero, negative and fractional quantities", () => {
    expect(() => addLine(empty, "NW-MUG", 0)).toThrow(/positive whole number/);
    expect(() => addLine(empty, "NW-MUG", -1)).toThrow(/positive whole number/);
    expect(() => addLine(empty, "NW-MUG", 1.5)).toThrow(/positive whole number/);
  });

  it("rejects unknown SKUs", () => {
    expect(() => addLine(empty, "NW-NOPE")).toThrow(/Unknown SKU/);
  });

  it("does not mutate the original cart", () => {
    const c = addLine(empty, "NW-MUG");
    expect(empty.lines).toEqual([]);
    expect(c).not.toBe(empty);
  });

  it("removes lines", () => {
    expect(removeLine(addLine(empty, "NW-MUG"), "NW-MUG").lines).toEqual([]);
  });

  it("sums weight across lines", () => {
    const c = addLine(addLine(empty, "NW-MUG", 2), "NW-PEN-SET");
    expect(totalWeight(c)).toBe(990);
  });
});
