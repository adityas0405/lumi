import type { Order } from "./types";

let seq = 0;

export function makeOrder(over: Partial<Order> = {}): Order {
  seq += 1;
  const totalCents = over.totalCents ?? 5000;
  return {
    id: `NW-${String(seq).padStart(6, "0")}`,
    placedAt: "2026-09-01T12:00:00.000Z",
    status: "delivered",
    region: "CA",
    customerEmail: "ada@example.com",
    items: [{ sku: "NW-MUG", name: "Stoneware mug", quantity: 1, unitCents: 2400 }],
    subtotalCents: totalCents,
    shippingCents: 0,
    taxCents: 0,
    totalCents,
    ...over,
  };
}
