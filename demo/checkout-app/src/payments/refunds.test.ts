import { describe, expect, it } from "vitest";
import { type CapturedOrder, refund } from "./refunds";

const order: CapturedOrder = {
  id: "ord_1",
  capturedCents: 5000,
  shippingCents: 599,
  refundedCents: 0,
  status: "captured",
};

describe("refund", () => {
  it("applies a partial refund", () => {
    const r = refund(order, 1200);
    expect(r.order).toMatchObject({ refundedCents: 1200, status: "partially_refunded" });
  });

  it("marks the order refunded when the full amount is returned", () => {
    expect(refund(order, 5000).order.status).toBe("refunded");
  });

  it("rejects a refund above the captured amount", () => {
    expect(() => refund(order, 5001)).toThrow(/exceeds refundable balance/);
  });

  it("rejects fractional cents", () => {
    expect(() => refund(order, 10.5)).toThrow(/whole cents/);
  });
});
