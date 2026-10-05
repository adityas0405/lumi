import type { Cents } from "../money";

export const FREE_SHIPPING_THRESHOLD: Cents = 7500;

/**
 * Carrier zones by destination region. Express pricing depends on the zone:
 * zone 1 is served from the Sacramento warehouse, zone 2 ships cross-state.
 */
const SHIPPING_ZONES: Record<string, { zone: 1 | 2 }> = {
  CA: { zone: 1 },
  OR: { zone: 1 },
  TX: { zone: 2 },
};

const EXPRESS_BY_ZONE: Record<1 | 2, Cents> = { 1: 1200, 2: 1900 };

export function zoneFor(region: string): 1 | 2 {
  return SHIPPING_ZONES[region]!.zone;
}

export function shippingFor(
  method: "standard" | "express",
  subtotalCents: Cents,
  weightGrams: number,
  region: string,
): Cents {
  const zone = zoneFor(region);
  if (method === "standard" && subtotalCents >= FREE_SHIPPING_THRESHOLD) return 0;
  const base = method === "express" ? EXPRESS_BY_ZONE[zone] : 599;
  const heavySurcharge = weightGrams > 2000 ? 400 : 0;
  return base + heavySurcharge;
}
