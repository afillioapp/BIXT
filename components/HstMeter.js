import { formatCurrency } from "../lib/insights";

// Home's HST card (owner request 2026-11-18): the HST on this fiscal year's
// receipts so far. What was paid on expenses is usually claimed back; what was
// charged on invoices is owed; the bottom line says which way the difference
// goes. Not narrowed by the category filter: it's about the whole business.
//
// hst: { paid, charged, net } from lib/insights.js hstBetween, or null while
// the year's months are still loading.
export default function HstMeter({ hst, currency, since }) {
  const money = (n) => formatCurrency(n, { decimals: 2, currency });
  const both = hst ? hst.paid + hst.charged : 0;
  const paidShare = both > 0 ? (hst.paid / both) * 100 : 0;
  const chargedShare = both > 0 ? 100 - paidShare : 0;

  let bottomLine = "";
  if (hst) {
    if (hst.net < 0) bottomLine = `The CRA owes you about ${money(-hst.net)}`;
    else if (hst.net > 0) bottomLine = `You owe the CRA about ${money(hst.net)}`;
    else bottomLine = "Nothing owed either way so far";
  }

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

          <p className="mt-3 text-sm font-semibold">{bottomLine}</p>
          <p className="mt-0.5 text-[11px] text-text-tertiary">An estimate from your saved receipts. Your accountant files the actual return.</p>
        </>
      )}
    </section>
  );
}
