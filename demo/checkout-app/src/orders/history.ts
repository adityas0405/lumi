import type { Cents } from "../money";

export interface OrderSummary {
  id: string;
  placedAt: string;
  totalCents: Cents;
  status: "placed" | "shipped" | "delivered" | "refunded";
  itemCount: number;
}

export function sortNewestFirst(orders: OrderSummary[]): OrderSummary[] {
  return [...orders].sort((a, b) => b.placedAt.localeCompare(a.placedAt));
}

export function lifetimeSpend(orders: OrderSummary[]): Cents {
  return orders.filter((o) => o.status !== "refunded").reduce((s, o) => s + o.totalCents, 0);
}
