import { findProduct } from "../catalog";
import type { Cart } from "../checkout/cart";
import { formatCents } from "../money";
import { TAX_RATES } from "../payments/tax";

interface Props {
  cart: Cart;
  onQuantity: (sku: string, delta: number) => void;
  onShipping: (method: Cart["shippingMethod"]) => void;
  onRegion: (region: string) => void;
}

export function Checkout({ cart, onQuantity, onShipping, onRegion }: Props) {
  return (
    <section className="panel">
      <h1>Your bag</h1>
      <ul className="lines">
        {cart.lines.map((line) => {
          const product = findProduct(line.sku);
          return (
            <li key={line.sku} className="line">
              <div className="thumb" aria-hidden>
                {product.name.slice(0, 1)}
              </div>
              <div className="line-info">
                <strong>{product.name}</strong>
                <span className="muted">{product.description}</span>
              </div>
              <div className="qty">
                <button type="button" onClick={() => onQuantity(line.sku, -1)} aria-label="Remove">
                  −
                </button>
                <span>{line.quantity}</span>
                <button type="button" onClick={() => onQuantity(line.sku, 1)} aria-label="Add one">
                  +
                </button>
              </div>
              <span className="price">{formatCents(product.priceCents * line.quantity)}</span>
            </li>
          );
        })}
      </ul>

      <h2>Delivery</h2>
      <div className="options">
        {(["standard", "express"] as const).map((method) => (
          <label key={method} className={`option ${cart.shippingMethod === method ? "on" : ""}`}>
            <input
              type="radio"
              name="shipping"
              checked={cart.shippingMethod === method}
              onChange={() => onShipping(method)}
            />
            <span>
              <strong>{method === "standard" ? "Standard" : "Express"}</strong>
              <span className="muted">
                {method === "standard" ? "3–5 business days · free over $75" : "Next business day"}
              </span>
            </span>
          </label>
        ))}
      </div>

      <label className="field">
        <span>Ship to</span>
        <select value={cart.region} onChange={(e) => onRegion(e.target.value)}>
          {Object.keys(TAX_RATES).map((r) => (
            <option key={r}>{r}</option>
          ))}
        </select>
      </label>
    </section>
  );
}
