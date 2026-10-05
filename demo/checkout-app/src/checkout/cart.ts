import { findProduct } from "../catalog";
import type { Cents } from "../money";

export interface CartLine {
  sku: string;
  quantity: number;
}

export interface Coupon {
  code: string;
  kind: "percent" | "fixed";
  /** Percent (0-100) for percent coupons, cents for fixed coupons. */
  value: number;
  minSubtotalCents: Cents;
}

export interface Cart {
  id: string;
  region: string;
  lines: CartLine[];
  coupon: Coupon | null;
  shippingMethod: "standard" | "express";
}

export const MAX_QUANTITY = 20;

export function addLine(cart: Cart, sku: string, quantity = 1): Cart {
  findProduct(sku);
  if (!Number.isInteger(quantity) || quantity < 1) {
    throw new Error("Quantity must be a positive whole number");
  }
  const existing = cart.lines.find((l) => l.sku === sku);
  const nextQuantity = (existing?.quantity ?? 0) + quantity;
  if (nextQuantity > MAX_QUANTITY) throw new Error(`At most ${MAX_QUANTITY} of one item`);
  const lines = existing
    ? cart.lines.map((l) => (l.sku === sku ? { ...l, quantity: nextQuantity } : l))
    : [...cart.lines, { sku, quantity }];
  return { ...cart, lines };
}

export function removeLine(cart: Cart, sku: string): Cart {
  return { ...cart, lines: cart.lines.filter((l) => l.sku !== sku) };
}

export function subtotal(cart: Cart): Cents {
  return cart.lines.reduce((sum, l) => sum + findProduct(l.sku).priceCents * l.quantity, 0);
}

export function totalWeight(cart: Cart): number {
  return cart.lines.reduce((sum, l) => sum + findProduct(l.sku).weightGrams * l.quantity, 0);
}
