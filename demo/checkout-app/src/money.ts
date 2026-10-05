/** All money in the checkout service is integer cents. */
export type Cents = number;

export function formatCents(cents: Cents, currency = "USD"): string {
  return new Intl.NumberFormat("en-US", { style: "currency", currency }).format(cents / 100);
}

export function assertCents(value: number, label = "amount"): void {
  if (!Number.isInteger(value)) throw new Error(`${label} must be whole cents, got ${value}`);
  if (value < 0) throw new Error(`${label} cannot be negative, got ${value}`);
}
