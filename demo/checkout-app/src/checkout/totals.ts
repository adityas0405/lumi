import type { Cents } from "../money";
import { taxFor } from "../payments/tax";
import { type Cart, subtotal, totalWeight } from "./cart";
import { discountFor } from "./discounts";
import { shippingFor } from "./shipping";

export interface Totals {
  subtotalCents: Cents;
  discountCents: Cents;
  shippingCents: Cents;
  taxCents: Cents;
  totalCents: Cents;
  couponCode: string | null;
}

/** Tax applies to the discounted subtotal; shipping is not taxed. */
export function computeTotals(cart: Cart): Totals {
  const subtotalCents = subtotal(cart);
  const discountCents = discountFor(cart.coupon, subtotalCents);
  const taxable = subtotalCents - discountCents;
  const shippingCents = shippingFor(cart.shippingMethod, taxable, totalWeight(cart));
  const taxCents = taxFor(taxable, cart.region);
  return {
    subtotalCents,
    discountCents,
    shippingCents,
    taxCents,
    totalCents: taxable + shippingCents + taxCents,
    couponCode: cart.coupon?.code ?? null,
  };
}
