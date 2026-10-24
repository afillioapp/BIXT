import { useEffect } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { weeklyTotals, categoryTotals, formatCurrency, spendingRows, fiscalYear } from "../lib/insights";
import { accentForCategory } from "./CategoryIcon";

// Home's spending chart: one bar-chart card for the period picked by Home's
// Week/Month/Year tabs (which live in the top card), with the period
// navigation (‹ date ›) in its top-right corner. When Home's
// category filter is active, the chart narrows to that category and wears
// its colour.
//
// It used to be a three-panel swipeable carousel (bars, a category donut, a
// top-categories list). The owner cut it to the bars on 2026-10-24: the
// category breakdown already has its own card further down Home.

function prevMonthDate(d) {
  return new Date(d.getFullYear(), d.getMonth() - 1, 1);
}

function mondayOf(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d;
}

function monthKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}`;
}

// "Jul 13 – 19" within one month; "Jun 29 – Jul 5" across months; adds the
// year when it isn't the current one. Same formatting stats.js uses.
function formatWeekRange(start, end) {
  if (!start || !end) return "This week";
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const startFmt = start.toLocaleString("en-US", { month: "short", day: "numeric" });
  const endFmt = sameMonth
    ? String(end.getDate())
    : end.toLocaleString("en-US", { month: "short", day: "numeric" });
  const yearSuffix = end.getFullYear() !== new Date().getFullYear() ? `, ${end.getFullYear()}` : "";
  return `${startFmt} – ${endFmt}${yearSuffix}`;
}

// Weeks-of-month bucketing (W1 = days 1-7, …) — mirrors stats.js's Month
// chart so Home and Stats always agree.
function monthBars(rows, refMonth) {
  const year = refMonth.getFullYear();
  const month = refMonth.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weekCount = Math.ceil(daysInMonth / 7);
  const values = new Array(weekCount).fill(0);
  let total = 0;
  for (const r of spendingRows(rows)) {
    if (!r.date) continue;
    const d = new Date(`${r.date}T00:00:00`);
    if (isNaN(d.getTime()) || d.getFullYear() !== year || d.getMonth() !== month) continue;
    const n = parseFloat(String(r.total ?? "").replace(/^'/, "").replace(/[$,\s]/g, ""));
    const amount = Number.isFinite(n) ? n : 0;
    values[Math.min(weekCount - 1, Math.floor((d.getDate() - 1) / 7))] += amount;
    total += amount;
  }
  return { values, total, labels: values.map((_, i) => `W${i + 1}`) };
}

// Compact ‹ date › cluster for a panel's top-right corner.
function PeriodNav({ label, onPrev, onNext, nextDisabled }) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button type="button" aria-label="Earlier" onClick={onPrev} className="text-text-tertiary">
        <ChevronLeft className="size-4" />
      </button>
      <p className="text-[11px] text-text-secondary whitespace-nowrap">{label}</p>
      <button
        type="button"
        aria-label="Later"
        onClick={onNext}
        disabled={nextDisabled}
        className="text-text-tertiary disabled:opacity-30"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

function PanelShell({ title, nav, children }) {
  return (
    <section className="h-[264px] flex flex-col pt-1">
      <div className="flex items-center justify-between gap-2 mb-2">
        <p className="text-sm font-semibold text-text-primary">{title}</p>
        {nav}
      </div>
      {children}
    </section>
  );
}

// No panel title — the Week/Month/Year tabs above already say what this is
// (owner request); the period total takes the title slot in teal.
function BarsPanel({ nav, ready, total, values, labels, boldIndex, accent, currency }) {
  const max = ready ? Math.max(...values, 1) : 1;
  return (
    <PanelShell
      title={
        <span className="text-base text-brand-teal" style={accent ? { color: accent } : undefined}>
          {ready ? formatCurrency(total, { decimals: 2, currency }) : "…"}
        </span>
      }
      nav={nav}
    >
      {!ready ? (
        <p className="text-xs text-text-secondary py-8 text-center flex-1">Loading…</p>
      ) : (
        <div className="flex-1 flex flex-col">
          <div className="flex-1 flex items-end justify-between gap-1.5">
            {values.map((v, i) => (
              <div
                key={i}
                className={`flex-1 rounded-t-md ${i === boldIndex ? "bg-brand-teal" : "bg-muted"}`}
                style={{
                  height: `${max > 0 ? Math.max(6, (v / max) * 100) : 6}%`,
                  ...(accent && i === boldIndex ? { background: accent } : {}),
                }}
              />
            ))}
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-text-secondary uppercase tracking-tight gap-1.5">
            {labels.map((l, i) => (
              <span key={i} className={`flex-1 text-center ${i === boldIndex ? "text-text-primary font-semibold" : ""}`}>
                {l}
              </span>
            ))}
          </div>
        </div>
      )}
    </PanelShell>
  );
}

// range ("Week" | "Month" | "Year") and offsets ({ Week, Month, Year }, how
// many periods back each tab is) are owned by Home, so the activity squares in
// the top card and this chart always show the same period.
export default function HomeCarousel({
  getMonthRows,
  ensureMonths,
  filterCategory = null,
  fiscalStart = 1,
  currency = "CAD",
  range,
  offsets,
  onOffsetChange,
}) {
  const now = new Date();

  // Home's category filter narrows every panel too (owner request). Cache
  // presence (loading/ready checks) still uses the unfiltered getMonthRows.
  const rowsFor = (d) => {
    const r = getMonthRows(d);
    if (!r || !filterCategory) return r;
    return r.filter((x) => (x.category || "Other") === filterCategory);
  };
  // …and every chart wears the filtered category's own color (owner request).
  const accent = filterCategory ? accentForCategory(filterCategory) : null;
  const weekOffset = offsets.Week;
  const barMonthOffset = offsets.Month;
  const yearOffset = offsets.Year;
  const step = (tab, delta) => onOffsetChange(tab, Math.max(0, offsets[tab] + delta));

  // ── Bar panel data, per selected range ──
  const refMonday = addDays(mondayOf(now), -7 * weekOffset);
  const weekNeededMonths = (() => {
    const dates = [addDays(refMonday, -7), addDays(refMonday, -1), refMonday, addDays(refMonday, 6)];
    const seen = new Map();
    for (const d of dates) seen.set(monthKey(d), new Date(d.getFullYear(), d.getMonth(), 1));
    return [...seen.values()];
  })();
  const refBarMonth = new Date(now.getFullYear(), now.getMonth() - barMonthOffset, 1);
  const fy = fiscalYear(fiscalStart, yearOffset, now);
  const yearMonthDates = fy.months;

  useEffect(() => {
    if (range === "Week") ensureMonths(weekNeededMonths);
    else if (range === "Month") ensureMonths([refBarMonth]);
    else ensureMonths(yearMonthDates);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, weekOffset, barMonthOffset, yearOffset, fiscalStart]);


  let bars;
  if (range === "Week") {
    const ready = weekNeededMonths.every((d) => getMonthRows(d));
    const weekly = ready ? weeklyTotals(weekNeededMonths.flatMap((d) => rowsFor(d)), refMonday) : null;
    bars = {
      label: weekly ? formatWeekRange(weekly.weekStart, weekly.weekEnd) : formatWeekRange(refMonday, addDays(refMonday, 6)),
      ready,
      total: weekly ? weekly.total : 0,
      values: weekly ? weekly.days.map((d) => d.amount) : [],
      labels: weekly ? weekly.days.map((d) => d.label.slice(0, 3)) : [],
      boldIndex: weekly ? weekly.days.findIndex((d) => d.isToday) : -1,
      onPrev: () => step("Week", 1),
      onNext: () => step("Week", -1),
      nextDisabled: weekOffset === 0,
    };
  } else if (range === "Month") {
    const rows = rowsFor(refBarMonth);
    const m = rows ? monthBars(rows, refBarMonth) : null;
    bars = {
      label:
        refBarMonth.getFullYear() === now.getFullYear()
          ? refBarMonth.toLocaleString("en-US", { month: "long" })
          : refBarMonth.toLocaleString("en-US", { month: "short", year: "numeric" }),
      ready: !!m,
      total: m ? m.total : 0,
      values: m ? m.values : [],
      labels: m ? m.labels : [],
      boldIndex: m ? m.values.indexOf(Math.max(...m.values)) : -1,
      onPrev: () => step("Month", 1),
      onNext: () => step("Month", -1),
      nextDisabled: barMonthOffset === 0,
    };
  } else {
    const ready = yearMonthDates.every((d) => getMonthRows(d));
    const values = ready
      ? yearMonthDates.map((d) => categoryTotals(rowsFor(d), d).total)
      : [];
    bars = {
      label: fy.label,
      ready,
      total: values.reduce((s, v) => s + v, 0),
      values,
      labels: fy.letters,
      boldIndex: ready ? (yearOffset === 0 ? fy.currentIndex : values.indexOf(Math.max(...values))) : -1,
      onPrev: () => step("Year", 1),
      onNext: () => step("Year", -1),
      nextDisabled: yearOffset === 0,
    };
  }

  return (
    <section className="bg-card rounded-2xl p-5 ring-1 ring-hairline">
      <BarsPanel
        accent={accent}
        currency={currency}
        nav={<PeriodNav label={bars.label} onPrev={bars.onPrev} onNext={bars.onNext} nextDisabled={bars.nextDisabled} />}
        ready={bars.ready}
        total={bars.total}
        values={bars.values}
        labels={bars.labels}
        boldIndex={bars.boldIndex}
      />
    </section>
  );
}
