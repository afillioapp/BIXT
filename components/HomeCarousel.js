import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { weeklyTotals, categoryTotals, formatCurrency } from "../lib/insights";

// Home's chart card (owner round 7): lives on a WHITE card below the
// compact navy header (pages/index.js), light-themed to match Stats.
// Three horizontally swipeable panels — range bar chart, by-category donut,
// top-categories list — with the Week/Month/Year segmented control at the
// bottom; each panel's period navigation (‹ date ›) sits in its top-right
// corner. When Home's category filter is active, every panel narrows too.
//
// Gestures stay deliberately separate: swiping changes which PANEL shows;
// the ‹ › buttons change that panel's PERIOD; the segmented control changes
// the bar panel's RANGE (and scrolls back to it).

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
  for (const r of rows || []) {
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

const MONTH_LABELS = ["J", "F", "M", "A", "M", "J", "J", "A", "S", "O", "N", "D"];

// Same exact hex palette Stats' donut/progress list uses.
const CATEGORY_PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];
function paletteColor(i) {
  return CATEGORY_PALETTE[i % CATEGORY_PALETTE.length];
}

// Compact ‹ date › cluster for a panel's top-right corner.
function PeriodNav({ label, onPrev, onNext, nextDisabled }) {
  return (
    <div className="flex items-center gap-1 shrink-0">
      <button type="button" aria-label="Earlier" onClick={onPrev} className="text-zinc-400">
        <ChevronLeft className="size-4" />
      </button>
      <p className="text-[11px] text-text-secondary whitespace-nowrap">{label}</p>
      <button
        type="button"
        aria-label="Later"
        onClick={onNext}
        disabled={nextDisabled}
        className="text-zinc-400 disabled:opacity-30"
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
function BarsPanel({ nav, ready, total, values, labels, boldIndex }) {
  const max = ready ? Math.max(...values, 1) : 1;
  return (
    <PanelShell
      title={
        <span className="text-base text-brand-teal">
          {ready ? formatCurrency(total, { decimals: 2 }) : "…"}
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
        </div>
      )}
    </PanelShell>
  );
}

function DarkDonut({ categories, total }) {
  const size = 108;
  const stroke = 18;
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
        <span className="text-[9px] text-text-secondary uppercase tracking-wider">Total</span>
        <span className="text-sm font-semibold text-text-primary">{formatCurrency(total, { decimals: 0 })}</span>
      </div>
    </div>
  );
}

function CategoryPanel({ monthData, nav }) {
  return (
    <PanelShell title="By category" nav={nav}>
      {!monthData ? (
        <p className="text-xs text-text-secondary py-8 text-center flex-1">Loading…</p>
      ) : monthData.categories.length === 0 ? (
        <p className="text-xs text-text-secondary py-8 text-center flex-1">No expenses this month.</p>
      ) : (
        <div className="flex-1 flex items-center gap-4">
          <DarkDonut categories={monthData.categories} total={monthData.total} />
          <ul className="flex-1 space-y-2 min-w-0">
            {monthData.categories.slice(0, 4).map((c, i) => (
              <li key={c.category} className="flex items-center gap-2">
                <span className="size-2 rounded-full shrink-0" style={{ background: paletteColor(i) }} />
                <span className="flex-1 min-w-0 text-[11px] text-text-primary truncate">{c.category}</span>
                <span className="text-[11px] font-semibold text-text-secondary shrink-0">{Math.round(c.percent)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </PanelShell>
  );
}

function TopCategoriesPanel({ monthData, nav }) {
  return (
    <PanelShell title="Top categories" nav={nav}>
      {!monthData ? (
        <p className="text-xs text-text-secondary py-8 text-center flex-1">Loading…</p>
      ) : monthData.categories.length === 0 ? (
        <p className="text-xs text-text-secondary py-8 text-center flex-1">No expenses this month.</p>
      ) : (
        <div className="flex-1 space-y-3 overflow-y-auto">
          {monthData.categories.slice(0, 4).map((c, i) => (
            <div key={c.category}>
              <div className="flex justify-between mb-1">
                <span className="text-[11px] font-medium text-text-primary">{c.category}</span>
                <span className="text-[11px] font-semibold text-text-secondary">{Math.round(c.percent)}%</span>
              </div>
              <div className="w-full bg-zinc-100 h-1.5 rounded-full overflow-hidden">
                <div className="h-full" style={{ width: `${c.percent}%`, background: paletteColor(i) }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </PanelShell>
  );
}

export default function HomeCarousel({ getMonthRows, ensureMonths, filterCategory = null }) {
  const now = new Date();

  // Home's category filter narrows every panel too (owner request). Cache
  // presence (loading/ready checks) still uses the unfiltered getMonthRows.
  const rowsFor = (d) => {
    const r = getMonthRows(d);
    if (!r || !filterCategory) return r;
    return r.filter((x) => (x.category || "Other") === filterCategory);
  };
  const [range, setRange] = useState("Week");
  const [weekOffset, setWeekOffset] = useState(0);
  const [barMonthOffset, setBarMonthOffset] = useState(0);
  const [yearOffset, setYearOffset] = useState(0);
  // Shared between the "By category" and "Top categories" panels.
  const [catMonthOffset, setCatMonthOffset] = useState(0);
  const scrollerRef = useRef(null);
  const [active, setActive] = useState(0);

  // ── Bar panel data, per selected range ──
  const refMonday = addDays(mondayOf(now), -7 * weekOffset);
  const weekNeededMonths = (() => {
    const dates = [addDays(refMonday, -7), addDays(refMonday, -1), refMonday, addDays(refMonday, 6)];
    const seen = new Map();
    for (const d of dates) seen.set(monthKey(d), new Date(d.getFullYear(), d.getMonth(), 1));
    return [...seen.values()];
  })();
  const refBarMonth = new Date(now.getFullYear(), now.getMonth() - barMonthOffset, 1);
  const targetYear = now.getFullYear() - yearOffset;
  const yearMonthDates = MONTH_LABELS.map((_, i) => new Date(targetYear, i, 1));

  useEffect(() => {
    if (range === "Week") ensureMonths(weekNeededMonths);
    else if (range === "Month") ensureMonths([refBarMonth]);
    else ensureMonths(yearMonthDates);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [range, weekOffset, barMonthOffset, yearOffset]);

  useEffect(() => {
    ensureMonths([new Date(now.getFullYear(), now.getMonth() - catMonthOffset, 1)]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catMonthOffset]);

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
      onPrev: () => setWeekOffset((o) => o + 1),
      onNext: () => setWeekOffset((o) => Math.max(0, o - 1)),
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
      onPrev: () => setBarMonthOffset((o) => o + 1),
      onNext: () => setBarMonthOffset((o) => Math.max(0, o - 1)),
      nextDisabled: barMonthOffset === 0,
    };
  } else {
    const ready = yearMonthDates.every((d) => getMonthRows(d));
    const values = ready
      ? yearMonthDates.map((d) => categoryTotals(rowsFor(d), d).total)
      : [];
    bars = {
      label: String(targetYear),
      ready,
      total: values.reduce((s, v) => s + v, 0),
      values,
      labels: MONTH_LABELS,
      boldIndex: ready ? (yearOffset === 0 ? now.getMonth() : values.indexOf(Math.max(...values))) : -1,
      onPrev: () => setYearOffset((o) => o + 1),
      onNext: () => setYearOffset((o) => Math.max(0, o - 1)),
      nextDisabled: yearOffset === 0,
    };
  }

  // ── Category panels data (month-based, shared offset) ──
  const refCatMonth = new Date(now.getFullYear(), now.getMonth() - catMonthOffset, 1);
  const catRows = rowsFor(refCatMonth);
  const monthData = catRows ? categoryTotals(catRows, refCatMonth) : null;
  const catMonthLabel =
    refCatMonth.getFullYear() === now.getFullYear()
      ? refCatMonth.toLocaleString("en-US", { month: "long" })
      : refCatMonth.toLocaleString("en-US", { month: "long", year: "numeric" });
  const catNav = (
    <PeriodNav
      label={catMonthLabel}
      onPrev={() => setCatMonthOffset((o) => o + 1)}
      onNext={() => setCatMonthOffset((o) => Math.max(0, o - 1))}
      nextDisabled={catMonthOffset === 0}
    />
  );

  function handleScroll() {
    const el = scrollerRef.current;
    if (!el || !el.clientWidth) return;
    setActive(Math.round(el.scrollLeft / el.clientWidth));
  }

  // Switching range snaps the carousel back to the bar panel it affects.
  function changeRange(r) {
    setRange(r);
    scrollerRef.current?.scrollTo({ left: 0, behavior: "smooth" });
  }

  const panels = [
    <BarsPanel
      key="bars"
      nav={<PeriodNav label={bars.label} onPrev={bars.onPrev} onNext={bars.onNext} nextDisabled={bars.nextDisabled} />}
      ready={bars.ready}
      total={bars.total}
      values={bars.values}
      labels={bars.labels}
      boldIndex={bars.boldIndex}
    />,
    <CategoryPanel key="category" monthData={monthData} nav={catNav} />,
    <TopCategoriesPanel key="top" monthData={monthData} nav={catNav} />,
  ];

  return (
    <div>
      {/* Range tabs above the card, exactly like the Stats page. */}
      <div className="flex p-1 bg-zinc-100 rounded-lg mb-4">
        {["Week", "Month", "Year"].map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => changeRange(t)}
            className={`flex-1 py-1.5 rounded-md text-xs font-medium transition-colors ${
              range === t ? "bg-white text-brand-navy shadow-sm" : "text-text-secondary"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      <section className="bg-white rounded-2xl p-5 ring-1 ring-black/5">
        <div
          ref={scrollerRef}
          onScroll={handleScroll}
          className="flex overflow-x-auto snap-x snap-mandatory scrollbar-none"
          style={{ scrollbarWidth: "none" }}
        >
          {panels.map((panel, i) => (
            <div key={i} className="w-full shrink-0 snap-start">
              {panel}
            </div>
          ))}
        </div>

        <div className="flex justify-center gap-1.5 mt-2">
          {panels.map((_, i) => (
            <span
              key={i}
              className={`h-1.5 rounded-full transition-all ${i === active ? "w-4 bg-brand-teal" : "w-1.5 bg-zinc-200"}`}
            />
          ))}
        </div>
      </section>
    </div>
  );
}
