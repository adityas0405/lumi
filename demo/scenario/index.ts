/**
 * The demo week: 8 pull requests from 3 coding agents against the checkout
 * service, replayed onto a real GitHub repo by `pnpm demo:reset`.
 *
 * Times are relative to the moment of the reset ("day 0" is today). Commit dates
 * are backdated with GIT_AUTHOR_DATE / GIT_COMMITTER_DATE; GitHub itself stamps
 * PR, merge and deploy times with the real clock, so the replay records the
 * simulated times for those in Lumi's database afterwards (see replay.ts).
 */

export type AgentKey = "claude-code" | "cursor" | "devin";

/** Day offset from today (0 = today, -6 = six days ago) and 24h local time. */
export interface SimTime {
  day: number;
  time: string;
}

export interface ScenarioCommit {
  message: string;
  at: SimTime;
  /** Paths (relative to the PR folder) included in this commit. Omit for "everything left". */
  files?: string[];
}

export interface ScenarioPr {
  key: string;
  /** Folder under scenario/prs holding the post-change files. */
  dir: string;
  agent: AgentKey;
  branch: string;
  title: string;
  body: string;
  labels: string[];
  commits: ScenarioCommit[];
  openedAt: SimTime;
  /** Merge after opening; omitted = stays open for review. "now" = at reset time. */
  mergedAt?: SimTime | "now";
  /** Seeded human decision for already-merged work. */
  approvedAt?: SimTime | "now";
  /** Ground truth for planted-error mode. Never shown to triage. */
  plantedError?: string;
  /** The GitHub issue a person filed to ask for this work; the PR closes it. */
  issue: { title: string; body: string };
  /** Decisions the agent logged while working, reported through the Lumi SDK. */
  decisions?: { title: string; chosen: string; alternatives: string[]; rationale: string }[];
}

export interface ScenarioDeploy {
  /** Deploy main after these PRs have merged. */
  afterMerging: string[];
  at: SimTime | "now";
}

const CLAUDE_TRAILER = "\n\nCo-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>";

export const PRS: ScenarioPr[] = [
  {
    key: "cart-tests",
    issue: {
      title: "Add test coverage for cart validation and coupons",
      body: "Cart quantity limits and coupon rules are only tested indirectly through totals. Please add direct unit tests so we can change them safely.",
    },
    decisions: [
      {
        title: "Scope of the change",
        chosen: "Tests only; no production code changes",
        alternatives: ["Also tighten validation messages while in there"],
        rationale:
          "The issue asked for coverage; changing behaviour in the same PR would make review harder.",
      },
    ],
    dir: "07-cart-tests",
    agent: "claude-code",
    branch: "claude/cart-validation-tests",
    title: "Add validation tests for cart quantities and coupons",
    labels: ["tests"],
    openedAt: { day: -6, time: "10:20" },
    approvedAt: { day: -5, time: "09:05" },
    mergedAt: { day: -5, time: "09:06" },
    commits: [
      {
        message: `Add tests for cart quantity validation and coupon rules${CLAUDE_TRAILER}`,
        at: { day: -6, time: "10:12" },
      },
    ],
    body: `## Summary
Adds unit tests for behaviour that was only covered indirectly:

- quantity validation in \`addLine\` (zero, negative, fractional, the per-item cap across repeated adds)
- unknown SKUs and immutability of the cart
- coupon lookup normalisation, percent rounding, the fixed-coupon minimum and the discount cap

No production code changes.

## Test plan
- [x] \`npm test\` passes locally (24 tests)

🤖 Generated with [Claude Code](https://claude.com/claude-code)`,
  },
  {
    key: "readme",
    issue: {
      title: "Document local setup and conventions",
      body: "New contributors keep asking how to run the service and why money is in cents. Put setup, layout and conventions in the README.",
    },
    dir: "08-readme",
    agent: "cursor",
    branch: "cursor/readme-dev-setup",
    title: "Document dev setup, conventions and deploys in README",
    labels: ["docs"],
    openedAt: { day: -5, time: "11:40" },
    approvedAt: { day: -5, time: "14:10" },
    mergedAt: { day: -5, time: "14:11" },
    commits: [
      {
        message: "Expand README with setup, conventions and deploy notes",
        at: { day: -5, time: "11:35" },
      },
    ],
    body: "Expands the README: Node version, scripts, module layout, money conventions and how deploys work.",
  },
  {
    key: "shipping-zones",
    issue: {
      title: "Charge express shipping by carrier zone",
      body: "Ops: express is a flat $15 today, but our carrier bills Sacramento-area deliveries (CA, OR) at a lower rate than cross-state ones. Price express by zone: zone 1 $12, zone 2 $19. Standard stays as is.\n\nWe ship to CA, OR, TX, NY and WA.",
    },
    dir: "03-shipping-zones",
    agent: "cursor",
    branch: "cursor/shipping-zones",
    title: "Zone-based express shipping rates",
    labels: ["checkout"],
    openedAt: { day: -4, time: "15:30" },
    // Approved and merged at reset time, then deployed: the deploy the incident follows.
    approvedAt: "now",
    mergedAt: "now",
    commits: [
      {
        message: "Add carrier zones and price express shipping by zone",
        at: { day: -4, time: "14:05" },
        files: ["src/checkout/shipping.ts", "src/checkout/totals.ts"],
      },
      { message: "Add tests for zone pricing", at: { day: -4, time: "15:22" } },
    ],
    body: `Express shipping now depends on the carrier zone instead of a flat $15.

- Zone 1 (CA, OR, served from Sacramento): $12.00
- Zone 2 (TX): $19.00
- Standard shipping is unchanged.

\`shippingFor\` takes the destination region, and \`computeTotals\` passes it through. Added tests for both zones and the heavy-parcel surcharge.`,
  },
  {
    key: "date-fns",
    issue: {
      title: "Order confirmation date is hard to read",
      body: 'Customers see "2026-09-24" on the confirmation page. Show a friendly date and time instead.',
    },
    dir: "06-date-fns",
    agent: "devin",
    branch: "devin/confirmation-date-format",
    title: "Use date-fns for the order confirmation timestamp",
    labels: ["agent: devin", "dependencies"],
    openedAt: { day: -3, time: "10:05" },
    approvedAt: { day: -3, time: "16:30" },
    mergedAt: { day: -3, time: "16:31" },
    commits: [
      { message: "Add date-fns and format confirmation timestamp", at: { day: -3, time: "09:58" } },
    ],
    body: `## Summary
The order confirmation page built its date string by hand (\`YYYY-MM-DD\`). This replaces it with \`date-fns\` \`format\` so customers see "September 24, 2026 at 3:41 PM".

## Changes
- Added dependency \`date-fns@^4.4.0\`
- \`OrderConfirmation.tsx\` uses \`format(placedAt, "MMMM d, yyyy 'at' h:mm a")\`

Requested by: @adityas0405`,
  },
  {
    key: "checkout-cta",
    issue: {
      title: "Checkout button should show the amount",
      body: 'Research shows buyers hesitate at "Place order". Show the total on the button and make it feel secure.',
    },
    dir: "05-checkout-cta",
    agent: "cursor",
    branch: "cursor/checkout-cta-copy",
    title: "Clearer checkout button: show the amount and a lock icon",
    labels: ["ui"],
    openedAt: { day: -3, time: "13:15" },
    approvedAt: { day: -3, time: "16:40" },
    mergedAt: { day: -3, time: "16:41" },
    commits: [
      {
        message: "Show total and lock icon on checkout button; tidy spacing",
        at: { day: -3, time: "13:09" },
      },
    ],
    body: `The checkout button now reads "Pay $X securely" with a lock icon, and the fine print mentions free returns. Slightly larger tap target and spacing.

UI-only change; no logic touched.`,
  },
  {
    key: "order-history",
    issue: {
      title: "Customers need to search and export their order history",
      body: "Support gets weekly requests for past orders. Customers should be able to filter by status and date, search, page through history and export a CSV for their accountant.",
    },
    decisions: [
      {
        title: "Pagination strategy",
        chosen: "Keyset pagination on (sort value, order id) with opaque cursors",
        alternatives: ["Offset pagination", "Loading all orders and slicing on the client"],
        rationale:
          "Offsets shift when new orders arrive between pages; keyset cursors stay stable.",
      },
      {
        title: "Lifetime spend definition",
        chosen: "Exclude both refunded and cancelled orders",
        alternatives: ["Keep excluding only refunded orders"],
        rationale:
          "Cancelled orders were never charged, so counting them overstated spend. This changes the number finance sees.",
      },
    ],
    dir: "04-order-history",
    agent: "claude-code",
    branch: "claude/order-history-module",
    title: "Order history: filtering, search, keyset pagination and CSV export",
    labels: ["orders"],
    openedAt: { day: -2, time: "17:45" },
    commits: [
      {
        message: `Add order types, filters and search${CLAUDE_TRAILER}`,
        at: { day: -2, time: "14:02" },
        files: [
          "src/orders/types.ts",
          "src/orders/filters.ts",
          "src/orders/search.ts",
          "src/orders/fixtures.ts",
          "src/orders/filters.test.ts",
          "src/orders/search.test.ts",
        ],
      },
      {
        message: `Add keyset pagination and rebuild history queries on top${CLAUDE_TRAILER}`,
        at: { day: -2, time: "15:31" },
        files: [
          "src/orders/pagination.ts",
          "src/orders/history.ts",
          "src/orders/pagination.test.ts",
          "src/orders/history.test.ts",
          "src/orders/sampleOrders.ts",
        ],
      },
      {
        message: `Add CSV export, formatting helpers and the order history page${CLAUDE_TRAILER}`,
        at: { day: -2, time: "17:38" },
      },
    ],
    body: `## Summary
Rebuilds \`src/orders\` into a proper order-history module and adds a page for it.

- **Filtering**: status, date range (date-only bounds cover the whole UTC day), min/max total, with validation errors the API can return as 400s
- **Search**: accent- and case-insensitive, all tokens must match (id, email, SKU, item name)
- **Pagination**: keyset cursors on (sort value, id), so pages stay stable when new orders arrive
- **CSV export**: RFC 4180 quoting and spreadsheet formula-injection protection
- **UI**: \`OrderHistory\` page with summary stats, filters, status chips and "Load more"

## Notes and open questions
- I kept \`sortNewestFirst\` and \`lifetimeSpend\` as deprecated wrappers. I couldn't tell whether anything outside this repo imports them.
- \`lifetimeSpend\` now also excludes **cancelled** orders (previously only refunded ones were excluded). I think that's correct, but it changes the number finance sees.
- This is a large PR (~980 lines). Happy to split it into filters/search, pagination and UI if that's easier to review.

## Test plan
- [x] 37 new unit tests across filters, search, pagination, export, history and formatting
- [ ] The page isn't wired into navigation yet; I checked it by rendering it manually

🤖 Generated with [Claude Code](https://claude.com/claude-code)`,
  },
  {
    key: "refund-guard",
    issue: {
      title: "Prevent over-refunds across partial refunds",
      body: "Support: an order was refunded twice in two partial refunds and the total went above what we charged. Make sure the running total of refunds can never exceed the captured amount.",
    },
    dir: "02-refund-guard",
    agent: "devin",
    branch: "devin/harden-refund-validation",
    title: "Harden refund validation against over-refunds",
    labels: ["agent: devin", "payments"],
    openedAt: { day: -1, time: "16:40" },
    plantedError:
      "The guard uses >= instead of >, so a refund of exactly the remaining balance is rejected: customers can never be fully refunded. The test that catches this ('marks the order refunded when the full amount is returned') was skipped as 'flaky'.",
    commits: [
      {
        message: "Add RefundError codes and block over-refunds across partial refunds",
        at: { day: -1, time: "16:21" },
      },
    ],
    body: `## Summary
Hardens \`refund()\` against over-refunding when an order receives several partial refunds.

## Changes
- New \`RefundError\` with machine-readable codes (\`invalid_amount\`, \`exceeds_balance\`, \`already_refunded\`)
- Guard compares the running refunded total against the captured amount
- Rejects refunds on orders that are already fully refunded
- Tests for multiple partial refunds and the new error codes

## Testing
All tests pass. One existing test was skipped because it was flaky on CI (shared fixture state).

Requested by: @adityas0405`,
  },
  {
    key: "tax-half-even",
    issue: {
      title: "FIN-212: order tax is one cent off the processor's tax report",
      body: "Finance: every month a handful of orders disagree by exactly one cent between our records and the payment processor's tax report. The processor rounds half to even; we round half up. Please match the processor.",
    },
    decisions: [
      {
        title: "Where to apply the new rounding",
        chosen:
          "Change taxFor so every caller gets half-even rounding, including refund recalculations",
        alternatives: [
          "Round half-even only at checkout and leave refunds on half-up",
          "Round the order total instead of the tax line",
        ],
        rationale:
          "The processor rounds the tax line, so rounding it the same way everywhere keeps both reports identical. I did not find a spec for refunds of old orders.",
      },
      {
        title: "Floating-point safety",
        chosen: "Treat values within 1e-9 of a half as exact halves",
        alternatives: ["Convert to integer arithmetic with a scaled rate", "Use a decimal library"],
        rationale:
          "Rates like 6.25% produce values such as 12.5000000001; a small tolerance fixes that without a new dependency.",
      },
    ],
    dir: "01-tax-half-even",
    agent: "claude-code",
    branch: "claude/tax-half-even-rounding",
    title: "Round sales tax half-even to match the processor's tax report",
    labels: ["payments"],
    openedAt: { day: 0, time: "08:48" },
    commits: [
      {
        message: `Add roundHalfEven and use it for sales tax (FIN-212)${CLAUDE_TRAILER}`,
        at: { day: 0, time: "08:31" },
      },
    ],
    body: `## Summary
Switches sales-tax rounding from half-up to half-even (banker's rounding).

Finance flagged one-cent mismatches between our order totals and the payment processor's monthly tax report (FIN-212). The processor rounds half-even; we round half-up. Whenever tax lands on exactly half a cent (for example $2.00 at Texas's 6.25% = 12.5¢) we charge 13¢ and the processor reports 12¢.

## Changes
- \`roundHalfEven()\` in \`money.ts\`, with tolerance for floating-point noise around .5
- \`taxFor()\` uses it
- Tests for exact-half cases and the helper itself

## What I'm unsure about
- **Existing orders.** This changes tax for everything computed from now on, including refund recalculations for orders placed under the old rounding. I couldn't find out whether finance wants that, or only new orders.
- **How often it matters.** Only orders whose tax lands on exactly half a cent change, by one cent. I estimated this from the rates, not from order data.

## Test plan
- [x] \`npm test\`: new cases \`taxFor(200, "TX") === 12\` and \`taxFor(600, "TX") === 38\`
- [ ] Not verified against a real processor report

🤖 Generated with [Claude Code](https://claude.com/claude-code)`,
  },
];

export const DEPLOYS: ScenarioDeploy[] = [
  { afterMerging: ["cart-tests", "readme"], at: { day: -5, time: "17:00" } },
  { afterMerging: ["date-fns", "checkout-cta"], at: { day: -3, time: "17:30" } },
  { afterMerging: ["shipping-zones"], at: "now" },
];

export const INITIAL_COMMIT: SimTime = { day: -20, time: "10:00" };

/**
 * "Day 0" is today unless it's too early for today's scripted events to have
 * happened yet, in which case the whole week shifts back a day.
 */
export function scenarioAnchor(now = new Date()): Date {
  const latestToday = PRS.flatMap((p) => [p.openedAt, ...p.commits.map((c) => c.at)])
    .filter((t) => t.day === 0)
    .reduce((max, t) => (t.time > max ? t.time : max), "00:00");
  const hhmm = `${String(now.getHours()).padStart(2, "0")}:${String(now.getMinutes()).padStart(2, "0")}`;
  const anchor = new Date(now);
  if (hhmm <= latestToday) anchor.setDate(anchor.getDate() - 1);
  return anchor;
}

export function simDate(t: SimTime | "now", anchor: Date, now = new Date()): Date {
  if (t === "now") return now;
  const [h, m] = t.time.split(":").map(Number);
  const d = new Date(anchor);
  d.setDate(d.getDate() + t.day);
  d.setHours(h!, m!, 0, 0);
  return d;
}
