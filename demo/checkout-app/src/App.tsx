import { useMemo, useState } from "react";
import { addLine, type Cart, removeLine } from "./checkout/cart";
import { lookupCoupon } from "./checkout/discounts";
import { computeTotals } from "./checkout/totals";
import { CartSummary } from "./ui/CartSummary";
import { Checkout } from "./ui/Checkout";
import { OrderConfirmation } from "./ui/OrderConfirmation";

const initialCart: Cart = {
  id: "cart_demo",
  region: "CA",
  lines: [
    { sku: "NW-DESK-LAMP", quantity: 1 },
    { sku: "NW-NOTEBOOK-A5", quantity: 2 },
  ],
  coupon: null,
  shippingMethod: "standard",
};

export function App() {
  const [cart, setCart] = useState<Cart>(initialCart);
  const [placedAt, setPlacedAt] = useState<Date | null>(null);
  const [couponError, setCouponError] = useState<string | null>(null);
  const totals = useMemo(() => computeTotals(cart), [cart]);

  if (placedAt) return <OrderConfirmation totals={totals} placedAt={placedAt} />;

  return (
    <div className="page">
      <header className="topbar">
        <span className="brand">Northwind Supply</span>
        <span className="secure">Secure checkout</span>
      </header>
      <main className="layout">
        <Checkout
          cart={cart}
          onQuantity={(sku, delta) =>
            setCart((c) => (delta > 0 ? addLine(c, sku, delta) : removeLine(c, sku)))
          }
          onShipping={(shippingMethod) => setCart((c) => ({ ...c, shippingMethod }))}
          onRegion={(region) => setCart((c) => ({ ...c, region }))}
        />
        <CartSummary
          totals={totals}
          couponError={couponError}
          onCoupon={(code) => {
            const coupon = lookupCoupon(code);
            setCouponError(coupon ? null : `"${code}" isn't a valid code`);
            setCart((c) => ({ ...c, coupon }));
          }}
          onPlaceOrder={() => setPlacedAt(new Date())}
        />
      </main>
    </div>
  );
}
