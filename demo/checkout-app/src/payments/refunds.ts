import { assertCents, type Cents } from "../money";

export interface CapturedOrder {
  id: string;
  capturedCents: Cents;
  shippingCents: Cents;
  refundedCents: Cents;
  status: "captured" | "partially_refunded" | "refunded";
}

export interface RefundResult {
  order: CapturedOrder;
  refundCents: Cents;
}

export function refundableCents(order: CapturedOrder): Cents {
  return order.capturedCents - order.refundedCents;
}

/**
 * Validates and applies a refund. The total refunded can never exceed what was
 * captured from the customer's card (which already includes shipping).
 */
export function refund(order: CapturedOrder, amountCents: Cents): RefundResult {
  assertCents(amountCents, "refund");
  if (amountCents === 0) throw new Error("Refund must be greater than zero");
  if (amountCents > refundableCents(order)) {
    throw new Error(
      `Refund of ${amountCents} exceeds refundable balance of ${refundableCents(order)}`,
    );
  }
  const refundedCents = order.refundedCents + amountCents;
  const status = refundedCents === order.capturedCents ? "refunded" : "partially_refunded";
  return { order: { ...order, refundedCents, status }, refundCents: amountCents };
}
