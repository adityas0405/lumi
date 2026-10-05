/** All money in the checkout service is integer cents. */
export type Cents = number;

export function formatCents(cents: Cents, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export function assertCents(value: number, label = "amount"): void {
  if (!Number.isInteger(value)) throw new Error(`${label} must be whole cents, got ${value}`);
  if (value < 0) throw new Error(`${label} cannot be negative, got ${value}`);
}

/**
 * Rounds to the nearest integer, sending exact halves to the even neighbour
 * (banker's rounding): 12.5 -> 12, 13.5 -> 14. Values within 1e-9 of a half are
 * treated as exact halves to absorb floating-point noise from rate multiplication.
 */
export function roundHalfEven(value: number): number {
  const floor = Math.floor(value);
  const fraction = value - floor;
  if (Math.abs(fraction - 0.5) < 1e-9) {
    return floor % 2 === 0 ? floor : floor + 1;
  }
  return Math.round(value);
}
