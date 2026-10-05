import { describe, expect, it } from "vitest";
import type { Cart } from "./cart";
import { COUPONS } from "./discounts";
import { computeTotals } from "./totals";

const cart = (over: Partial<Cart> = {}): Cart => ({
  id: "cart_1",
  region: "CA",
  lines: [{ sku: "NW-NOTEBOOK-A5", quantity: 2 }],
  coupon: null,
  shippingMethod: "standard",
  ...over,
});

describe("computeTotals", () => {
  it("adds shipping below the free-shipping threshold", () => {
    const t = computeTotals(cart());
    expect(t.subtotalCents).toBe(3700);
    expect(t.shippingCents).toBe(599);
    expect(t.taxCents).toBe(268);
    expect(t.totalCents).toBe(3700 + 599 + 268);
  });

  it("taxes the discounted subtotal", () => {
    const t = computeTotals(cart({ coupon: COUPONS.WELCOME10! }));
    expect(t.discountCents).toBe(370);
    expect(t.taxCents).toBe(241);
    expect(t.couponCode).toBe("WELCOME10");
  });

  it("ships free at or above the threshold", () => {
    const t = computeTotals(cart({ lines: [{ sku: "NW-DESK-LAMP", quantity: 1 }] }));
    expect(t.shippingCents).toBe(0);
  });

  it("uses zone pricing for express delivery", () => {
    expect(computeTotals(cart({ shippingMethod: "express" })).shippingCents).toBe(1200);
    expect(computeTotals(cart({ shippingMethod: "express", region: "TX" })).shippingCents).toBe(
      1900,
    );
  });
});
