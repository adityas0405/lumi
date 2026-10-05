import { formatCents } from "../money";
import type { Order, OrderStatus } from "./types";

export const STATUS_LABELS: Record<OrderStatus, string> = {
  placed: "Placed",
  shipped: "Shipped",
  delivered: "Delivered",
  refunded: "Refunded",
  cancelled: "Cancelled",
};

export type StatusTone = "neutral" | "info" | "success" | "warning";

export const STATUS_TONES: Record<OrderStatus, StatusTone> = {
  placed: "neutral",
  shipped: "info",
  delivered: "success",
  refunded: "warning",
  cancelled: "warning",
};

export function formatOrderDate(iso: string, locale = "en-US"): string {
  return new Intl.DateTimeFormat(locale, {
    year: "numeric",
    month: "short",
    day: "numeric",
    timeZone: "UTC",
  }).format(new Date(iso));
}

/** "Arc desk lamp", "Arc desk lamp and Stoneware mug", "Arc desk lamp and 2 more". */
export function itemSummary(order: Order): string {
  const [first, second, ...rest] = order.items;
  if (!first) return "No items";
  if (!second) return first.name;
  if (rest.length === 0) return `${first.name} and ${second.name}`;
  return `${first.name} and ${rest.length + 1} more`;
}

export function itemCount(order: Order): number {
  return order.items.reduce((n, i) => n + i.quantity, 0);
}

export function orderLine(order: Order): string {
  return `${order.id} · ${formatOrderDate(order.placedAt)} · ${formatCents(order.totalCents)}`;
}
