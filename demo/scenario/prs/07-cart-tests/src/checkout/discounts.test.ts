import { describe, expect, it } from "vitest";
import { COUPONS, discountFor, lookupCoupon } from "./discounts";

describe("lookupCoupon", () => {
  it("is case- and whitespace-insensitive", () => {
    expect(lookupCoupon("  welcome10 ")?.code).toBe("WELCOME10");
  });

  it("returns null for unknown codes", () => {
    expect(lookupCoupon("FREEMONEY")).toBeNull();
  });
});

describe("discountFor", () => {
  it("is zero without a coupon", () => {
    expect(discountFor(null, 5000)).toBe(0);
  });

  it("rounds percent discounts down to whole cents", () => {
    expect(discountFor(COUPONS.WELCOME10!, 1299)).toBe(129);
  });

  it("applies fixed discounts only above the minimum subtotal", () => {
    expect(discountFor(COUPONS.DESK25!, 9999)).toBe(0);
    expect(discountFor(COUPONS.DESK25!, 10000)).toBe(2500);
  });

  it("never discounts more than the subtotal", () => {
    const big = { ...COUPONS.DESK25!, minSubtotalCents: 0, value: 999999 };
    expect(discountFor(big, 1200)).toBe(1200);
  });
});
