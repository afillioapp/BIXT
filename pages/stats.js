import { useState, useEffect, useMemo, useRef } from "react";
import { ArrowDownRight, ArrowUpRight, ChevronLeft, ChevronRight } from "lucide-react";
import { useDrive } from "../lib/useDrive";
import { findMonthExpenseSheetId, listExpenseRows } from "../lib/google";
import { useMonthRows } from "../lib/useMonthRows";
import { weeklyTotals, categoryTotals, formatCurrency } from "../lib/insights";
import DriveFallback from "../components/DriveFallback";

// Ported 1:1 from lovable-design/src/routes/stats.tsx: Week/Month/Year
// segmented control driving a bar chart card, a separate always-monthly "By
// Category" donut + legend, a static category-filter pill row (the source
// mock doesn't wire these to anything either — kept decorative, "All"
// always active), and a "Top Categories" progress-bar list. Every number is
// real; only the visual chrome is ported verbatim.

function prevMonthDate(d) {
  return new Date(d.getFullYear(), d.getMonth() - 1, 1);
}

// Period navigation (owner request): every range card can slide back to
// earlier periods. Past periods live in past months' Expenses sheets, so a
// per-month row cache is fetched on demand (same idea the Year tab already
// used) and views are computed from whichever months the period needs.
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
// year when it isn't the current one.
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

// Exact hex palette lovable-design's stats.tsx uses for its 4 mock
// categories (teal/navy/amber/rose), cycled for however many categories a
// real month actually has.
const CATEGORY_PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

function paletteColor(i) {
  return CATEGORY_PALETTE[i % CATEGORY_PALETTE.length];
}

function parseAmount(v) {
  const n = parseFloat(String(v ?? "").replace(/^'/, "").replace(/[$,\s]/g, ""));
  return Number.isFinite(n) ? n : 0;
}

function parseRowDate(dateStr) {
  if (!dateStr) return null;
  const d = new Date(`${dateStr}T00:00:00`);
  return isNaN(d.getTime()) ? null : d;
}

// Weeks-of-month bucketing (W1 = days 1-7, W2 = 8-14, …) for the Month tab,
// matching the design's "W1..W4" bar-chart style.
function monthWeeklyBreakdown(rows, now) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const weekCount = Math.ceil(daysInMonth / 7);
  const values = new Array(weekCount).fill(0);
  let total = 0;
  for (const r of rows || []) {
    const d = parseRowDate(r.date);
    if (!d || d.getFullYear() !== year || d.getMonth() !== month) continue;
    const amount = parseAmount(r.total);
    const idx = Math.min(Math.floor((d.getDate() - 1) / 7), weekCount - 1);
    values[idx] += amount;
    total += amount;
  }
  return {
    labels: values.map((_, i) => `W${i + 1}`),
    values,
    total,
  };
}

const MONTH_LABELS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

function Segmented({ range, setRange }) {
  return (
    <div className="flex p-1 bg-zinc-100 rounded-lg mb-6">
      {["Week", "Month", "Year"].map((t) => (
        <button
          key={t}
          onClick={() => setRange(t)}
          className={`flex-1 py-1.5 text-xs font-medium rounded-md transition ${
            range === t ? "bg-white ring-1 ring-black/5 shadow-sm text-text-primary" : "text-text-secondary"
          }`}
        >
          {t}
        </button>
      ))}
    </div>
  );
}

function RangeCard({ sub, total, delta, labels, values, boldIndex, onPrev, onNext, nextDisabled }) {
  const max = Math.max(...values, 1);
  const touchStartX = useRef(null);
  return (
    <section
      className="bg-white rounded-2xl p-5 mb-6 ring-1 ring-black/5"
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        if (touchStartX.current === null) return;
        const dx = (e.changedTouches[0]?.clientX ?? touchStartX.current) - touchStartX.current;
        touchStartX.current = null;
        // Swipe right → earlier period; swipe left → back toward now.
        if (dx > 48) onPrev?.();
        else if (dx < -48 && !nextDisabled) onNext?.();
      }}
    >
      <div className="flex justify-between items-end mb-6">
        <div>
          <div className="flex items-center gap-1.5">
            {onPrev && (
              <button type="button" aria-label="Earlier" onClick={onPrev} className="text-zinc-400 -ml-1">
                <ChevronLeft className="size-4" />
              </button>
            )}
            <p className="text-xs text-text-secondary">{sub}</p>
            {onNext && (
              <button
                type="button"
                aria-label="Later"
                onClick={onNext}
                disabled={nextDisabled}
                className="text-zinc-400 disabled:opacity-30"
              >
                <ChevronRight className="size-4" />
              </button>
            )}
          </div>
          <p className="text-2xl font-semibold">{total}</p>
        </div>
        {delta && (
          <span className="inline-flex items-center gap-1 text-[11px] font-medium text-brand-teal">
            {delta.up ? <ArrowUpRight className="size-3" /> : <ArrowDownRight className="size-3" />}
            {delta.text}
          </span>
        )}
      </div>

      <div className="flex items-end justify-between h-36 gap-1.5">
        {values.map((v, i) => (
          // The bar must be a DIRECT child of the h-36 row: percentage
          // heights only resolve against a parent with a definite height.
          // (An intermediate auto-height wrapper here made every bar 0px.)
          <div
            key={i}
            className={`flex-1 rounded-t-md ${i === boldIndex ? "bg-brand-teal" : "bg-zinc-100"}`}
            style={{ height: `${max > 0 ? Math.max(6, (v / max) * 100) : 6}%` }}
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
    </section>
  );
}

function Donut({ categories, total }) {
  const size = 168;
  const stroke = 26;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const sumPct = categories.reduce((s, x) => s + x.percent, 0) || 1;
  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="#F4F4F5" strokeWidth={stroke} />
        {categories.map((cat, i) => {
          const len = (cat.percent / sumPct) * c;
          const el = (
            <circle
              key={cat.category}
              cx={size / 2}
              cy={size / 2}
              r={r}
              fill="none"
              stroke={paletteColor(i)}
              strokeWidth={stroke}
              strokeDasharray={`${len} ${c - len}`}
              strokeDashoffset={-offset}
              strokeLinecap="butt"
            />
          );
          offset += len;
          return el;
        })}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[10px] text-text-secondary uppercase tracking-wider">Total</span>
        <span className="text-lg font-semibold">{formatCurrency(total, { decimals: 0 })}</span>
      </div>
    </div>
  );
}

export default function Stats({ user }) {
  const {
    accessToken,
    rootFolderId,
    profile,
    profileLoading,
    needsConnect,
    loadError,
    requestAccess,
    retryConnection,
  } = useDrive(user);

  const [range, setRange] = useState("Week");

  // How many periods back from "now" each range is currently showing.
  const [weekOffset, setWeekOffset] = useState(0);
  const [monthOffset, setMonthOffset] = useState(0);
  const [yearOffset, setYearOffset] = useState(0);

  // Per-month row cache backing Week/Month period navigation — shared with
  // Home's carousel via lib/useMonthRows.js so both pages agree on the same
  // data and never double-fetch a month. Seeds current + previous month
  // automatically; missing months are requested below as periods need them.
  const { getMonthRows, ensureMonths } = useMonthRows(accessToken, rootFolderId);

  const [yearCache, setYearCache] = useState({}); // { [year]: number[12] }
  const [yearLoading, setYearLoading] = useState(false);

  // The months the currently shown period needs (its own span plus the
  // previous period, for the vs-last delta).
  function neededMonthDates() {
    const now = new Date();
    if (range === "Week") {
      const refMonday = addDays(mondayOf(now), -7 * weekOffset);
      const dates = [addDays(refMonday, -7), addDays(refMonday, -1), refMonday, addDays(refMonday, 6)];
      const seen = new Map();
      for (const d of dates) seen.set(monthKey(d), new Date(d.getFullYear(), d.getMonth(), 1));
      return [...seen.values()];
    }
    if (range === "Month") {
      const ref = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
      return [ref, prevMonthDate(ref)];
    }
    return [];
  }

  // Ask the shared cache for any months the current period needs but
  // doesn't have yet (a retry happens next time this effect runs, since
  // ensureMonths only re-requests months still missing from the cache).
  useEffect(() => {
    ensureMonths(neededMonthDates());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, weekOffset, monthOffset, accessToken, rootFolderId]);

  // Year tab: walk every month of the selected year on demand, skip months
  // with no Expenses sheet, cache per year so sliding back and forth never
  // refetches.
  useEffect(() => {
    const targetYear = new Date().getFullYear() - yearOffset;
    if (range !== "Year" || yearCache[targetYear] || yearLoading || !accessToken || !rootFolderId) return;
    let cancelled = false;
    setYearLoading(true);
    async function loadYear() {
      const totals = new Array(12).fill(0);
      await Promise.all(
        MONTH_LABELS.map(async (_, i) => {
          const d = new Date(targetYear, i, 1);
          try {
            const sheetId = await findMonthExpenseSheetId(accessToken, rootFolderId, d);
            if (!sheetId) return;
            const monthRows = await listExpenseRows(accessToken, sheetId);
            totals[i] = monthRows.reduce((sum, r) => sum + parseAmount(r.total), 0);
          } catch {
            // Skip a month Drive couldn't reach — the rest of the year still renders.
          }
        })
      );
      if (!cancelled) {
        setYearCache((c) => ({ ...c, [targetYear]: totals }));
        setYearLoading(false);
      }
    }
    loadYear();
    return () => {
      cancelled = true;
    };
  }, [range, yearOffset, yearCache, yearLoading, accessToken, rootFolderId]);

  if (profileLoading || !profile) {
    return (
      <div className="min-h-screen bg-background font-sans text-text-primary pb-28">
        <div className="bg-brand-navy rounded-b-3xl pt-10 pb-7 text-white relative z-10 shadow-xl shadow-brand-navy/25">
          <div className="mx-auto max-w-md px-5">
            <h1 className="text-2xl font-semibold tracking-tight">Statistics</h1>
          </div>
        </div>
        <div className="mx-auto max-w-md px-5 pt-6">
          <DriveFallback
            needsConnect={needsConnect}
            loadError={loadError}
            onConnect={requestAccess}
            onRetry={retryConnection}
          />
        </div>
      </div>
    );
  }

  const now = new Date();
  const monthTag = now.toLocaleString("en-US", { month: "long" });
  const currentMonthRows = getMonthRows(now);
  const prevMonthRows = getMonthRows(prevMonthDate(now));
  const rows = currentMonthRows && prevMonthRows ? [...currentMonthRows, ...prevMonthRows] : null;
  const monthData = rows ? categoryTotals(rows, now) : { total: 0, categories: [] };

  // Rows for the shown period, drawn from the shared per-month cache; null
  // while any needed month is still fetching.
  const needed = neededMonthDates();
  const periodReady = needed.every((d) => getMonthRows(d));
  const periodRows = periodReady ? needed.flatMap((d) => getMonthRows(d)) : null;

  const loadingCard = (
    <section className="bg-white rounded-2xl p-5 mb-6 ring-1 ring-black/5">
      <p className="text-xs text-text-secondary">Loading…</p>
    </section>
  );

  let rangeCard = null;
  if (range === "Week") {
    if (!periodRows) {
      rangeCard = loadingCard;
    } else {
      const refDate = addDays(mondayOf(now), -7 * weekOffset);
      const weekly = weeklyTotals(periodRows, refDate);
      const rounded = weekly.percentChange !== null ? Math.round(Math.abs(weekly.percentChange)) : null;
      rangeCard = (
        <RangeCard
          sub={formatWeekRange(weekly.weekStart, weekly.weekEnd)}
          total={formatCurrency(weekly.total, { decimals: 2 })}
          delta={rounded !== null ? { up: weekly.percentChange > 0, text: `${rounded}% vs prior week` } : null}
          labels={weekly.days.map((d) => d.label.slice(0, 3))}
          values={weekly.days.map((d) => d.amount)}
          boldIndex={weekly.days.findIndex((d) => d.isToday)}
          onPrev={() => setWeekOffset((o) => o + 1)}
          onNext={() => setWeekOffset((o) => Math.max(0, o - 1))}
          nextDisabled={weekOffset === 0}
        />
      );
    }
  } else if (range === "Month") {
    if (!periodRows) {
      rangeCard = loadingCard;
    } else {
      const refMonth = new Date(now.getFullYear(), now.getMonth() - monthOffset, 1);
      const monthWeekly = monthWeeklyBreakdown(periodRows, refMonth);
      const prevTotal = categoryTotals(periodRows, prevMonthDate(refMonth)).total;
      const change = prevTotal > 0 ? Math.round(((monthWeekly.total - prevTotal) / prevTotal) * 100) : null;
      const monthLabel =
        refMonth.getFullYear() === now.getFullYear()
          ? refMonth.toLocaleString("en-US", { month: "long" })
          : refMonth.toLocaleString("en-US", { month: "long", year: "numeric" });
      rangeCard = (
        <RangeCard
          sub={monthLabel}
          total={formatCurrency(monthWeekly.total, { decimals: 2 })}
          delta={change !== null ? { up: change > 0, text: `${Math.abs(change)}% vs prior month` } : null}
          labels={monthWeekly.labels}
          values={monthWeekly.values}
          boldIndex={monthWeekly.values.indexOf(Math.max(...monthWeekly.values))}
          onPrev={() => setMonthOffset((o) => o + 1)}
          onNext={() => setMonthOffset((o) => Math.max(0, o - 1))}
          nextDisabled={monthOffset === 0}
        />
      );
    }
  } else if (range === "Year") {
    const targetYear = now.getFullYear() - yearOffset;
    const totals = yearCache[targetYear];
    if (yearLoading || !totals) {
      rangeCard = loadingCard;
    } else {
      const yearTotal = totals.reduce((s, v) => s + v, 0);
      rangeCard = (
        <RangeCard
          sub={yearOffset === 0 ? `${targetYear} · year to date` : String(targetYear)}
          total={formatCurrency(yearTotal, { decimals: 2 })}
          delta={null}
          labels={MONTH_LABELS}
          values={totals}
          boldIndex={yearOffset === 0 ? now.getMonth() : totals.indexOf(Math.max(...totals))}
          onPrev={() => setYearOffset((o) => o + 1)}
          onNext={() => setYearOffset((o) => Math.max(0, o - 1))}
          nextDisabled={yearOffset === 0}
        />
      );
    }
  }

  return (
    <div className="min-h-screen bg-background font-sans text-text-primary pb-28">
      <div className="bg-brand-navy rounded-b-3xl pt-10 pb-7 text-white relative z-10 shadow-xl shadow-brand-navy/25">
        <div className="mx-auto max-w-md px-5">
          <h1 className="text-2xl font-semibold tracking-tight">Statistics</h1>
          <p className="text-xs text-white/60 mt-1">Track how your business spends.</p>
        </div>
      </div>

      <div className="mx-auto max-w-md px-5 pt-6">
        <Segmented range={range} setRange={setRange} />

        {rows === null && <p className="text-xs text-text-secondary mb-4">Loading receipts…</p>}

        {rangeCard}

        <section className="bg-white rounded-2xl p-5 mb-6 ring-1 ring-black/5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold">By Category</h2>
              <p className="text-[11px] text-text-secondary mt-0.5">{monthTag}'s share of total spending</p>
            </div>
          </div>

          {monthData.categories.length === 0 ? (
            <p className="text-xs text-text-secondary py-6 text-center">No expenses yet this month.</p>
          ) : (
            <div className="flex items-center gap-5">
              <Donut categories={monthData.categories} total={monthData.total} />
              <ul className="flex-1 space-y-2.5 min-w-0">
                {monthData.categories.map((c, i) => (
                  <li key={c.category} className="flex items-center gap-2">
                    <span className="size-2.5 rounded-full shrink-0" style={{ background: paletteColor(i) }} />
                    <div className="flex-1 min-w-0">
                      <p className="text-[11px] font-medium truncate">{c.category}</p>
                    </div>
                    <span className="text-[11px] font-semibold text-text-secondary">{Math.round(c.percent)}%</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <div className="flex gap-2 overflow-x-auto pb-4 -mx-5 px-5 scrollbar-none">
          {["All", ...monthData.categories.map((c) => c.category)].slice(0, 6).map((c, i) => (
            <button
              key={c}
              className={`px-4 py-2 rounded-full text-xs font-medium shrink-0 ${
                i === 0 ? "bg-brand-navy text-white" : "bg-white ring-1 ring-black/5 text-text-secondary"
              }`}
            >
              {c}
            </button>
          ))}
        </div>

        {monthData.categories.length > 0 && (
          <section>
            <h2 className="text-sm font-semibold mb-3">Top Categories</h2>
            <div className="space-y-4 bg-white p-5 rounded-2xl ring-1 ring-black/5">
              {monthData.categories.map((c, i) => (
                <div key={c.category}>
                  <div className="flex justify-between mb-1.5">
                    <span className="text-xs font-medium">{c.category}</span>
                    <span className="text-xs font-semibold">{Math.round(c.percent)}%</span>
                  </div>
                  <div className="w-full bg-zinc-100 h-1.5 rounded-full overflow-hidden">
                    <div className="h-full" style={{ width: `${c.percent}%`, background: paletteColor(i) }} />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}
      </div>
    </div>
  );
}
