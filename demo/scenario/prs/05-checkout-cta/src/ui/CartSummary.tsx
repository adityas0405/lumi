import { useState } from "react";
import type { Totals } from "../checkout/totals";
import { formatCents } from "../money";

interface Props {
  totals: Totals;
  couponError: string | null;
  onCoupon: (code: string) => void;
  onPlaceOrder: () => void;
}

function LockIcon() {
  return (
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M17 9V7a5 5 0 0 0-10 0v2H5v13h14V9h-2Zm-8-2a3 3 0 0 1 6 0v2H9V7Zm4 10.73V19h-2v-1.27a2 2 0 1 1 2 0Z"
      />
    </svg>
  );
}

export function CartSummary({ totals, couponError, onCoupon, onPlaceOrder }: Props) {
  const [code, setCode] = useState("");
  return (
    <aside className="panel summary">
      <h2>Order summary</h2>
      <dl>
        <div>
          <dt>Subtotal</dt>
          <dd>{formatCents(totals.subtotalCents)}</dd>
        </div>
        {totals.discountCents > 0 && (
          <div className="discount">
            <dt>Discount ({totals.couponCode})</dt>
            <dd>−{formatCents(totals.discountCents)}</dd>
          </div>
        )}
        <div>
          <dt>Shipping</dt>
          <dd>{totals.shippingCents === 0 ? "Free" : formatCents(totals.shippingCents)}</dd>
        </div>
        <div>
          <dt>Tax</dt>
          <dd>{formatCents(totals.taxCents)}</dd>
        </div>
        <div className="total">
          <dt>Total</dt>
          <dd>{formatCents(totals.totalCents)}</dd>
        </div>
      </dl>

      <form
        className="coupon"
        onSubmit={(e) => {
          e.preventDefault();
          if (code.trim()) onCoupon(code);
        }}
      >
        <input value={code} onChange={(e) => setCode(e.target.value)} placeholder="Promo code" />
        <button type="submit">Apply</button>
      </form>
      {couponError && <p className="error">{couponError}</p>}

      <button type="button" className="cta" onClick={onPlaceOrder}>
        <LockIcon />
        Pay {formatCents(totals.totalCents)} securely
      </button>
      <p className="fineprint">
        You won't be charged until your order ships. Free returns within 30 days.
      </p>
    </aside>
  );
}
