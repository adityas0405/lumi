import type { Cents } from "../money";

/** Combined state + average local sales tax rates by region. */
export const TAX_RATES: Record<string, number> = {
  CA: 0.0725,
  NY: 0.08875,
  TX: 0.0625,
  WA: 0.1025,
  OR: 0,
};

export function taxRate(region: string): number {
  const rate = TAX_RATES[region];
  if (rate === undefined) throw new Error(`No tax rate configured for region ${region}`);
  return rate;
}

/** Sales tax on a taxable amount, rounded to the nearest cent (half up). */
export function taxFor(taxableCents: Cents, region: string): Cents {
  return Math.round(taxableCents * taxRate(region));
}
