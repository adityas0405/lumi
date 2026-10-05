import { type Cents, roundHalfEven } from "../money";

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

/**
 * Sales tax on a taxable amount, rounded half-even to the nearest cent. The
 * payment processor's tax report rounds half-even, so rounding half-up here made
 * our totals disagree with it by one cent whenever tax landed on exactly half a
 * cent (FIN-212).
 */
export function taxFor(taxableCents: Cents, region: string): Cents {
  return roundHalfEven(taxableCents * taxRate(region));
}
