import type { Cents } from "../money";
import type { Coupon } from "./cart";

export const COUPONS: Record<string, Coupon> = {
  WELCOME10: { code: "WELCOME10", kind: "percent", value: 10, minSubtotalCents: 0 },
  DESK25: { code: "DESK25", kind: "fixed", value: 2500, minSubtotalCents: 10000 },
};

export function lookupCoupon(code: string): Coupon | null {
  return COUPONS[code.trim().toUpperCase()] ?? null;
}

/** Discount never exceeds the subtotal and is zero below the coupon minimum. */
export function discountFor(coupon: Coupon | null, subtotalCents: Cents): Cents {
  if (!coupon || subtotalCents < coupon.minSubtotalCents) return 0;
  const raw = coupon.kind === "percent" ? Math.floor((subtotalCents * coupon.value) / 100) : coupon.value;
  return Math.min(raw, subtotalCents);
}
