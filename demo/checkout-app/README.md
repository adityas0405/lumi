# Northwind checkout service

Checkout for Northwind Supply: cart, discounts, shipping, sales tax, refunds and order history.
All money is integer cents.

```bash
npm install
npm run dev     # http://localhost:5173
npm test
```

| Module | What it does |
| --- | --- |
| `src/checkout` | Cart, coupons, shipping and order totals |
| `src/payments` | Sales tax and refunds |
| `src/orders` | Order history |
| `src/ui` | Checkout page |
