import { CATALOG } from "../catalog";
import { taxFor } from "../payments/tax";
import type { Order, OrderItem, OrderStatus } from "./types";

/** Small deterministic PRNG so sample data is identical on every load. */
function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const REGIONS = ["CA", "OR", "TX"];
const STATUS_WEIGHTS: [OrderStatus, number][] = [
  ["delivered", 0.62],
  ["shipped", 0.14],
  ["placed", 0.1],
  ["refunded", 0.08],
  ["cancelled", 0.06],
];

function pickStatus(r: number): OrderStatus {
  let acc = 0;
  for (const [status, weight] of STATUS_WEIGHTS) {
    acc += weight;
    if (r < acc) return status;
  }
  return "delivered";
}

/** Demo order history for the order-history page; not used in production paths. */
export function sampleOrders(count = 60, seed = 42, now = Date.UTC(2026, 8, 20)): Order[] {
  const rand = mulberry32(seed);
  const orders: Order[] = [];
  for (let i = 0; i < count; i++) {
    const lineCount = 1 + Math.floor(rand() * 3);
    const items: OrderItem[] = [];
    for (let l = 0; l < lineCount; l++) {
      const product = CATALOG[Math.floor(rand() * CATALOG.length)]!;
      if (items.some((it) => it.sku === product.sku)) continue;
      items.push({
        sku: product.sku,
        name: product.name,
        quantity: 1 + Math.floor(rand() * 2),
        unitCents: product.priceCents,
      });
    }
    const region = REGIONS[Math.floor(rand() * REGIONS.length)]!;
    const subtotalCents = items.reduce((s, it) => s + it.unitCents * it.quantity, 0);
    const shippingCents = subtotalCents >= 7500 ? 0 : 599;
    const taxCents = taxFor(subtotalCents, region);
    orders.push({
      id: `NW-${String(10480 + i).padStart(6, "0")}`,
      placedAt: new Date(now - Math.floor(rand() * 180) * 86_400_000 - i * 3_600_000).toISOString(),
      status: pickStatus(rand()),
      region,
      customerEmail: `customer${(i % 7) + 1}@example.com`,
      items,
      subtotalCents,
      shippingCents,
      taxCents,
      totalCents: subtotalCents + shippingCents + taxCents,
    });
  }
  return orders;
}
