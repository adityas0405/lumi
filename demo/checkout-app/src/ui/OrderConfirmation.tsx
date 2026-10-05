import type { Totals } from "../checkout/totals";
import { formatCents } from "../money";

export function OrderConfirmation({ totals, placedAt }: { totals: Totals; placedAt: Date }) {
  const date = `${placedAt.getFullYear()}-${String(placedAt.getMonth() + 1).padStart(2, "0")}-${String(
    placedAt.getDate(),
  ).padStart(2, "0")}`;
  return (
    <div className="page confirm">
      <div className="panel">
        <div className="check" aria-hidden>
          ✓
        </div>
        <h1>Order placed</h1>
        <p className="muted">Placed on {date}</p>
        <p className="big">{formatCents(totals.totalCents)}</p>
        <p className="muted">A receipt is on its way to your inbox.</p>
      </div>
    </div>
  );
}
