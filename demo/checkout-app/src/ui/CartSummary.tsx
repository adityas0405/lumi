import { useState } from "react";
import type { Totals } from "../checkout/totals";
import { formatCents } from "../money";

interface Props {
  totals: Totals;
  couponError: string | null;
  onCoupon: (code: string) => void;
  onPlaceOrder: () => void;
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
        Place order
      </button>
      <p className="fineprint">You won't be charged until your order ships.</p>
    </aside>
  );
}
