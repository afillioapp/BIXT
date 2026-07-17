import { useState, useEffect, useMemo } from "react";
import { ArrowDownRight, ArrowUpRight } from "lucide-react";
import { useDrive } from "../lib/useDrive";
import { findMonthExpenseSheetId, listExpenseRows } from "../lib/google";
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

// Exact hex palette lovable-design's stats.tsx uses for its 4 mock
// categories (teal/navy/amber/rose), cycled for however many categories a
// real month actually has.
const CATEGORY_PALETTE = ["#0FB5A7", "#1E2A44", "#F59E0B", "#FB7185"];

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

function RangeCard({ sub, total, delta, labels, values, boldIndex }) {
  const max = Math.max(...values, 1);
  return (
    <section className="bg-white rounded-2xl p-5 mb-6 ring-1 ring-black/5">
      <div className="flex justify-between items-end mb-6">
        <div>
          <p className="text-xs text-text-secondary">{sub}</p>
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
          <div key={i} className="flex-1 flex flex-col items-center gap-2">
            <div
              className={`w-full rounded-t-md ${i === boldIndex ? "bg-brand-teal" : "bg-zinc-100"}`}
              style={{ height: `${Math.max(6, (v / max) * 100)}%` }}
            />
          </div>
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

  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [range, setRange] = useState("Week");

  const [yearMonths, setYearMonths] = useState(null); // array of 12 totals, or null until loaded
  const [yearLoading, setYearLoading] = useState(false);

  useEffect(() => {
    if (!accessToken || !rootFolderId) return;
    let cancelled = false;

    async function load() {
      setError("");
      try {
        const now = new Date();
        const months = [now, prevMonthDate(now)];
        const results = await Promise.all(
          months.map(async (d) => {
            const sheetId = await findMonthExpenseSheetId(accessToken, rootFolderId, d);
            return sheetId ? listExpenseRows(accessToken, sheetId) : [];
          })
        );
        if (cancelled) return;
        setRows(results.flat());
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, rootFolderId]);

  // Year tab is on-demand: walk every month of the current year the first
  // time it's selected, skip months with no Expenses sheet, and cache the
  // per-month totals in state so switching tabs back and forth never
  // refetches.
  useEffect(() => {
    if (range !== "Year" || yearMonths || yearLoading || !accessToken || !rootFolderId) return;
    let cancelled = false;
    setYearLoading(true);
    async function loadYear() {
      const now = new Date();
      const year = now.getFullYear();
      const totals = new Array(12).fill(0);
      await Promise.all(
        MONTH_LABELS.map(async (_, i) => {
          const d = new Date(year, i, 1);
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
        setYearMonths(totals);
        setYearLoading(false);
      }
    }
    loadYear();
    return () => {
      cancelled = true;
    };
  }, [range, yearMonths, yearLoading, accessToken, rootFolderId]);

  if (profileLoading || !profile) {
    return (
      <div className="min-h-screen bg-background font-sans text-text-primary pb-28">
        <div className="mx-auto max-w-md px-5 pt-10">
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
  const monthData = rows ? categoryTotals(rows, now) : { total: 0, categories: [] };
  const weekly = rows ? weeklyTotals(rows, now) : null;

  let rangeCard = null;
  if (range === "Week" && weekly) {
    const rounded = weekly.percentChange !== null ? Math.round(Math.abs(weekly.percentChange)) : null;
    rangeCard = (
      <RangeCard
        sub="This week"
        total={formatCurrency(weekly.total, { decimals: 2 })}
        delta={rounded !== null ? { up: weekly.percentChange > 0, text: `${rounded}% vs last week` } : null}
        labels={weekly.days.map((d) => d.label.slice(0, 3))}
        values={weekly.days.map((d) => d.amount)}
        boldIndex={weekly.days.findIndex((d) => d.isToday)}
      />
    );
  } else if (range === "Month" && rows) {
    const monthWeekly = monthWeeklyBreakdown(rows, now);
    const prevTotal = categoryTotals(rows, prevMonthDate(now)).total;
    const change = prevTotal > 0 ? Math.round(((monthWeekly.total - prevTotal) / prevTotal) * 100) : null;
    rangeCard = (
      <RangeCard
        sub="This month"
        total={formatCurrency(monthWeekly.total, { decimals: 2 })}
        delta={change !== null ? { up: change > 0, text: `${Math.abs(change)}% vs last month` } : null}
        labels={monthWeekly.labels}
        values={monthWeekly.values}
        boldIndex={monthWeekly.values.indexOf(Math.max(...monthWeekly.values))}
      />
    );
  } else if (range === "Year") {
    if (yearLoading || !yearMonths) {
      rangeCard = (
        <section className="bg-white rounded-2xl p-5 mb-6 ring-1 ring-black/5">
          <p className="text-xs text-text-secondary">Loading year…</p>
        </section>
      );
    } else {
      const yearTotal = yearMonths.reduce((s, v) => s + v, 0);
      rangeCard = (
        <RangeCard
          sub="Year to date"
          total={formatCurrency(yearTotal, { decimals: 2 })}
          delta={null}
          labels={MONTH_LABELS}
          values={yearMonths}
          boldIndex={now.getMonth()}
        />
      );
    }
  }

  return (
    <div className="min-h-screen bg-background font-sans text-text-primary pb-28">
      <div className="mx-auto max-w-md px-5 pt-10">
        <header className="mb-6">
          <h1 className="text-2xl font-semibold tracking-tight">Statistics</h1>
          <p className="text-xs text-text-secondary mt-1">Track how your business spends.</p>
        </header>

        <Segmented range={range} setRange={setRange} />

        {error && <div className="text-xs text-destructive mb-4">{error}</div>}
        {rows === null && !error && <p className="text-xs text-text-secondary mb-4">Loading receipts…</p>}

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
