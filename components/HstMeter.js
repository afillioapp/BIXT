import { formatCurrency } from "../lib/insights";

// Home's HST card (owner request 2026-11-18): the HST on this fiscal year's
// receipts so far, paid on expenses and charged on invoices. The owner asked
// for no "who owes whom" line under it. Not narrowed by the category filter:
// it's about the whole business.
//
// hst: { paid, charged } from lib/insights.js hstBetween, or null while the
// year's months are still loading.
export default function HstMeter({ hst, currency, since }) {
  const money = (n) => formatCurrency(n, { decimals: 2, currency });
  const both = hst ? hst.paid + hst.charged : 0;
  const paidShare = both > 0 ? (hst.paid / both) * 100 : 0;
  const chargedShare = both > 0 ? 100 - paidShare : 0;

  return (
    <section aria-label="HST this fiscal year" className="mb-4 rounded-2xl bg-card ring-1 ring-hairline p-4">
      <div className="flex items-baseline justify-between mb-3">
        <h2 className="text-sm font-semibold">HST this fiscal year</h2>
        <p className="text-[11px] text-text-secondary">Since {since}</p>
      </div>

      {!hst ? (
        <p className="text-sm text-text-secondary" role="status">
          Adding up your receipts…
        </p>
      ) : (
        <>
          <dl className="flex flex-col gap-1.5 text-sm">
            <div className="flex items-center justify-between">
              <dt className="flex items-center gap-2 text-text-secondary">
                <span className="size-2 rounded-full" style={{ background: "var(--activity-out)" }} aria-hidden="true" />
                Paid on expenses
              </dt>
              <dd className="font-semibold tabular-nums">{money(hst.paid)}</dd>
            </div>
            <div className="flex items-center justify-between">
              <dt className="flex items-center gap-2 text-text-secondary">
                <span className="size-2 rounded-full" style={{ background: "var(--activity-in)" }} aria-hidden="true" />
                Charged on invoices
              </dt>
              <dd className="font-semibold tabular-nums">{money(hst.charged)}</dd>
            </div>
          </dl>

          {/* Paid against charged, as one bar. */}
          <div className="mt-3 h-2 rounded-full bg-track overflow-hidden flex" aria-hidden="true">
            <span style={{ width: `${paidShare}%`, background: "var(--activity-out)" }} />
            <span style={{ width: `${chargedShare}%`, background: "var(--activity-in)" }} />
          </div>
        </>
      )}
    </section>
  );
}
