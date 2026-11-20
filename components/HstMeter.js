import { formatCurrency } from "../lib/insights";

// The fiscal year's HST so far, as two figures in Home's top card, under the
// headline total (owner request 2026-11-18, moved and trimmed 2026-11-20): HST
// paid on expenses and HST charged on invoices, nothing else. Not narrowed by
// the category filter or the Week / Month / Year tab: it's the whole business,
// the whole fiscal year.
//
// hst: { paid, charged } from lib/insights.js hstBetween, or null while the
// year's months are still loading.
export default function HstMeter({ hst, currency }) {
  const money = (n) => (hst ? formatCurrency(n, { decimals: 2, currency }) : "—");
  return (
    <dl className="grid grid-cols-2 gap-4 mt-4" aria-label="HST this fiscal year">
      <div>
        <dt className="text-[11px] text-text-secondary">HST paid</dt>
        <dd className="text-base font-semibold tabular-nums">{money(hst?.paid)}</dd>
      </div>
      <div>
        <dt className="text-[11px] text-text-secondary">HST charged</dt>
        <dd className="text-base font-semibold tabular-nums">{money(hst?.charged)}</dd>
      </div>
    </dl>
  );
}
