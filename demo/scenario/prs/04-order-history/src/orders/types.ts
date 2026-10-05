import type { Cents } from "../money";

export type OrderStatus = "placed" | "shipped" | "delivered" | "refunded" | "cancelled";

export const ORDER_STATUSES: readonly OrderStatus[] = [
  "placed",
  "shipped",
  "delivered",
  "refunded",
  "cancelled",
];

export interface OrderItem {
  sku: string;
  name: string;
  quantity: number;
  unitCents: Cents;
}

export interface Order {
  id: string;
  /** ISO 8601 timestamp in UTC. */
  placedAt: string;
  status: OrderStatus;
  region: string;
  customerEmail: string;
  items: OrderItem[];
  subtotalCents: Cents;
  shippingCents: Cents;
  taxCents: Cents;
  totalCents: Cents;
}

export type OrderSort = "newest" | "oldest" | "total_desc" | "total_asc";

export interface OrderQuery {
  statuses?: OrderStatus[];
  /** Inclusive lower bound, ISO date (YYYY-MM-DD) or timestamp. */
  from?: string;
  /** Inclusive upper bound, ISO date (YYYY-MM-DD) or timestamp. */
  to?: string;
  minTotalCents?: Cents;
  maxTotalCents?: Cents;
  search?: string;
  sort?: OrderSort;
  limit?: number;
  cursor?: string | null;
}

export interface OrderPage {
  orders: Order[];
  /** Pass back as `cursor` to fetch the next page; null on the last page. */
  nextCursor: string | null;
  /** Number of orders matching the filters, across all pages. */
  totalMatches: number;
}

export interface HistorySummary {
  orderCount: number;
  lifetimeSpendCents: Cents;
  refundedCents: Cents;
  averageOrderCents: Cents;
}
