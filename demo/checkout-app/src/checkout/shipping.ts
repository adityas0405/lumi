import type { Cents } from "../money";

export const FREE_SHIPPING_THRESHOLD: Cents = 7500;

export function shippingFor(
  method: "standard" | "express",
  subtotalCents: Cents,
  weightGrams: number,
): Cents {
  if (method === "standard" && subtotalCents >= FREE_SHIPPING_THRESHOLD) return 0;
  const base = method === "express" ? 1500 : 599;
  const heavySurcharge = weightGrams > 2000 ? 400 : 0;
  return base + heavySurcharge;
}
