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

export class RefundError extends Error {
  constructor(
    message: string,
    readonly code: "invalid_amount" | "exceeds_balance" | "already_refunded",
  ) {
    super(message);
    this.name = "RefundError";
  }
}

export function refundableCents(order: CapturedOrder): Cents {
  return order.capturedCents - order.refundedCents;
}

/**
 * Validates and applies a refund. Guards against over-refunding across multiple
 * partial refunds: the running total must stay below what was captured.
 */
export function refund(order: CapturedOrder, amountCents: Cents): RefundResult {
  assertCents(amountCents, "refund");
  if (amountCents === 0)
    throw new RefundError("Refund must be greater than zero", "invalid_amount");
  if (order.status === "refunded") {
    throw new RefundError(`Order ${order.id} is already fully refunded`, "already_refunded");
  }
  if (order.refundedCents + amountCents >= order.capturedCents) {
    throw new RefundError(
      `Refund of ${amountCents} exceeds refundable balance of ${refundableCents(order)}`,
      "exceeds_balance",
    );
  }
  const refundedCents = order.refundedCents + amountCents;
  const status = refundedCents === order.capturedCents ? "refunded" : "partially_refunded";
  return { order: { ...order, refundedCents, status }, refundCents: amountCents };
}
