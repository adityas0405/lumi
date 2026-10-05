# Northwind checkout service

Checkout for Northwind Supply: cart, discounts, shipping, sales tax, refunds and order history.
All money is integer cents; never use floating-point dollars in this codebase.

## Getting started

Requires Node 24.

```bash
npm install
npm run dev        # http://localhost:5173
npm test           # unit tests (Vitest)
npm run typecheck
```

## Layout

| Module | What it does |
| --- | --- |
| `src/checkout` | Cart, coupons, shipping and order totals |
| `src/payments` | Sales tax and refunds |
| `src/orders` | Order history |
| `src/ui` | Checkout page |

## Conventions

- Money is `Cents` (an integer). Format only at the edge with `formatCents`.
- Tax applies to the discounted subtotal. Shipping is not taxed.
- Every change to `src/payments` needs a test and a reviewer from the payments group.
- CI runs typecheck and unit tests on every pull request and uploads JUnit results.

## Deploys

`main` deploys to production. Each deploy is recorded as a GitHub deployment in the
`production` environment.
