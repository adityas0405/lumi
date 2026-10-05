import { itemCount } from "./format";
import type { Order } from "./types";

export const CSV_COLUMNS = [
  "order_id",
  "placed_at",
  "status",
  "region",
  "customer_email",
  "items",
  "subtotal",
  "shipping",
  "tax",
  "total",
] as const;

/** Quotes a field when it contains a delimiter, quote or newline (RFC 4180). */
export function csvField(value: string | number): string {
  const text = String(value);
  // Neutralise spreadsheet formula injection from user-controlled fields.
  const safe = /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
  return /[",\r\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

function dollars(cents: number): string {
  return (cents / 100).toFixed(2);
}

export function toCsvRow(order: Order): string {
  return [
    order.id,
    order.placedAt,
    order.status,
    order.region,
    order.customerEmail,
    itemCount(order),
    dollars(order.subtotalCents),
    dollars(order.shippingCents),
    dollars(order.taxCents),
    dollars(order.totalCents),
  ]
    .map(csvField)
    .join(",");
}

export function toCsv(orders: Order[]): string {
  return [CSV_COLUMNS.join(","), ...orders.map(toCsvRow)].join("\r\n");
}
