import type { Order } from "./types";

/** Lower-cases and strips accents so "Café" matches "cafe". */
export function fold(text: string): string {
  return text.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

export function tokenize(query: string): string[] {
  return fold(query)
    .split(/\s+/)
    .map((t) => t.replace(/^#/, ""))
    .filter(Boolean);
}

function haystack(order: Order): string {
  const parts = [
    order.id,
    order.customerEmail,
    order.region,
    ...order.items.flatMap((i) => [i.sku, i.name]),
  ];
  return fold(parts.join(" "));
}

/** Every token must appear somewhere in the order (AND semantics). */
export function matchesSearch(order: Order, query: string): boolean {
  const tokens = tokenize(query);
  if (tokens.length === 0) return true;
  const text = haystack(order);
  return tokens.every((t) => text.includes(t));
}
