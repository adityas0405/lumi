import { useMemo, useState } from "react";
import { formatCents } from "../money";
import { toCsv } from "../orders/export";
import { InvalidQueryError } from "../orders/filters";
import { formatOrderDate, itemSummary, STATUS_LABELS, STATUS_TONES } from "../orders/format";
import { queryHistory, summarize } from "../orders/history";
import { ORDER_STATUSES, type Order, type OrderSort, type OrderStatus } from "../orders/types";
import "./order-history.css";

const SORTS: { value: OrderSort; label: string }[] = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "total_desc", label: "Highest total" },
  { value: "total_asc", label: "Lowest total" },
];

function download(filename: string, contents: string) {
  const url = URL.createObjectURL(new Blob([contents], { type: "text/csv" }));
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function OrderHistory({ orders }: { orders: Order[] }) {
  const [statuses, setStatuses] = useState<OrderStatus[]>([]);
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState<OrderSort>("newest");
  const [pages, setPages] = useState(1);

  const summary = useMemo(() => summarize(orders), [orders]);

  const result = useMemo(() => {
    try {
      let cursor: string | null = null;
      const shown: Order[] = [];
      let totalMatches = 0;
      for (let p = 0; p < pages; p++) {
        const page = queryHistory(orders, { statuses, search, sort, limit: 10, cursor });
        shown.push(...page.orders);
        totalMatches = page.totalMatches;
        cursor = page.nextCursor;
        if (!cursor) break;
      }
      return { shown, totalMatches, hasMore: cursor !== null, error: null };
    } catch (e) {
      if (e instanceof InvalidQueryError) {
        return { shown: [], totalMatches: 0, hasMore: false, error: e.message };
      }
      throw e;
    }
  }, [orders, statuses, search, sort, pages]);

  const toggleStatus = (s: OrderStatus) => {
    setPages(1);
    setStatuses((cur) => (cur.includes(s) ? cur.filter((x) => x !== s) : [...cur, s]));
  };

  return (
    <section className="panel history">
      <header className="history-head">
        <h1>Order history</h1>
        <button
          type="button"
          className="ghost"
          onClick={() => download("orders.csv", toCsv(result.shown))}
          disabled={result.shown.length === 0}
        >
          Export CSV
        </button>
      </header>

      <div className="stats">
        <div>
          <span className="muted">Orders</span>
          <strong>{summary.orderCount}</strong>
        </div>
        <div>
          <span className="muted">Lifetime spend</span>
          <strong>{formatCents(summary.lifetimeSpendCents)}</strong>
        </div>
        <div>
          <span className="muted">Average order</span>
          <strong>{formatCents(summary.averageOrderCents)}</strong>
        </div>
        <div>
          <span className="muted">Refunded</span>
          <strong>{formatCents(summary.refundedCents)}</strong>
        </div>
      </div>

      <div className="filters">
        <input
          type="search"
          value={search}
          placeholder="Search by order, email or item"
          onChange={(e) => {
            setPages(1);
            setSearch(e.target.value);
          }}
        />
        <select
          value={sort}
          onChange={(e) => {
            setPages(1);
            setSort(e.target.value as OrderSort);
          }}
        >
          {SORTS.map((s) => (
            <option key={s.value} value={s.value}>
              {s.label}
            </option>
          ))}
        </select>
      </div>
      <div className="chips">
        {ORDER_STATUSES.map((s) => (
          <button
            key={s}
            type="button"
            className={`chip ${statuses.includes(s) ? "on" : ""}`}
            onClick={() => toggleStatus(s)}
          >
            {STATUS_LABELS[s]}
          </button>
        ))}
      </div>

      {result.error ? (
        <p className="error">{result.error}</p>
      ) : (
        <>
          <p className="muted">
            Showing {result.shown.length} of {result.totalMatches}
          </p>
          <table className="orders">
            <thead>
              <tr>
                <th>Order</th>
                <th>Date</th>
                <th>Items</th>
                <th>Status</th>
                <th className="num">Total</th>
              </tr>
            </thead>
            <tbody>
              {result.shown.map((o) => (
                <tr key={o.id}>
                  <td className="mono">{o.id}</td>
                  <td>{formatOrderDate(o.placedAt)}</td>
                  <td>{itemSummary(o)}</td>
                  <td>
                    <span className={`badge ${STATUS_TONES[o.status]}`}>
                      {STATUS_LABELS[o.status]}
                    </span>
                  </td>
                  <td className="num">{formatCents(o.totalCents)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {result.hasMore && (
            <button type="button" className="ghost more" onClick={() => setPages((p) => p + 1)}>
              Load more
            </button>
          )}
        </>
      )}
    </section>
  );
}
