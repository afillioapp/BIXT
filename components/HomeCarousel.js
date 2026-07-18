import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { weeklyTotals, categoryTotals, formatCurrency } from "../lib/insights";

// Three horizontally swipeable panels living inside Home's navy hero, right
// below the total-balance card: weekly bar chart, by-category donut, and a
// top-categories progress list — dark-restyled versions of the Stats page's
// own cards, reusing its exact math (weeklyTotals/categoryTotals) so the
// numbers always agree with /stats. CSS scroll-snap + dot indicators, same
// approach components/InsightCards.js used before it was replaced by the
// current design (see git history), reimplemented against Tailwind classes.
//
// Gestures are kept deliberately separate: swiping the row changes which
// PANEL is showing (native scroll-snap); the ‹ › buttons inside a panel
// change the PERIOD that panel's data is drawn from. Panels never attach
// their own touch handlers, so the two never fight over a horizontal drag.

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

// Same exact hex palette Stats' donut/progress list uses, so a category
// renders the same color whether you're looking at Home or Stats.
const CATEGORY_PALETTE = ["#0FB5A7", "#1E2A44", "#F59E0B", "#FB7185"];
function paletteColor(i) {
  return CATEGORY_PALETTE[i % CATEGORY_PALETTE.length];
}

function PeriodHeader({ label, onPrev, onNext, nextDisabled }) {
  return (
    <div className="flex items-center gap-1.5 mb-1">
      <button type="button" aria-label="Earlier" onClick={onPrev} className="text-white/50 -ml-1">
        <ChevronLeft className="size-4" />
      </button>
      <p className="text-xs text-white/60">{label}</p>
      <button
        type="button"
        aria-label="Later"
        onClick={onNext}
        disabled={nextDisabled}
        className="text-white/50 disabled:opacity-30"
      >
        <ChevronRight className="size-4" />
      </button>
    </div>
  );
}

function WeeklyPanel({ weekly, weekOffset, setWeekOffset, refMonday }) {
  const label = weekly ? formatWeekRange(weekly.weekStart, weekly.weekEnd) : formatWeekRange(refMonday, addDays(refMonday, 6));
  const max = weekly ? Math.max(...weekly.days.map((d) => d.amount), 1) : 1;
  return (
    <section className="bg-white/5 rounded-2xl p-5 ring-1 ring-white/10 h-[228px] flex flex-col">
      <PeriodHeader
        label={label}
        onPrev={() => setWeekOffset((o) => o + 1)}
        onNext={() => setWeekOffset((o) => Math.max(0, o - 1))}
        nextDisabled={weekOffset === 0}
      />
      <p className="text-sm font-semibold text-white mb-3">Weekly expenses</p>
      {!weekly ? (
        <p className="text-xs text-white/50 py-8 text-center flex-1">Loading…</p>
      ) : (
        <div className="flex-1 flex flex-col">
          <p className="text-lg font-semibold text-brand-teal mb-3">{formatCurrency(weekly.total, { decimals: 2 })}</p>
          <div className="flex-1 flex items-end justify-between gap-1.5">
            {weekly.days.map((d, i) => (
              <div
                key={i}
                className={`flex-1 rounded-t-md ${d.isToday ? "bg-brand-teal" : "bg-white/10"}`}
                style={{ height: `${max > 0 ? Math.max(6, (d.amount / max) * 100) : 6}%` }}
              />
            ))}
          </div>
          <div className="flex justify-between mt-2 text-[10px] text-white/50 uppercase tracking-tight gap-1.5">
            {weekly.days.map((d, i) => (
              <span key={i} className={`flex-1 text-center ${d.isToday ? "text-white font-semibold" : ""}`}>
                {d.label.slice(0, 3)}
              </span>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

function DarkDonut({ categories, total }) {
  const size = 116;
  const stroke = 20;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  const sumPct = categories.reduce((s, x) => s + x.percent, 0) || 1;
  return (
    <div className="relative flex items-center justify-center shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.1)" strokeWidth={stroke} />
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
        <span className="text-[9px] text-white/50 uppercase tracking-wider">Total</span>
        <span className="text-sm font-semibold text-white">{formatCurrency(total, { decimals: 0 })}</span>
      </div>
    </div>
  );
}

function CategoryPanel({ monthData, label, offset, setOffset }) {
  return (
    <section className="bg-white/5 rounded-2xl p-5 ring-1 ring-white/10 h-[228px] flex flex-col">
      <PeriodHeader
        label={label}
        onPrev={() => setOffset((o) => o + 1)}
        onNext={() => setOffset((o) => Math.max(0, o - 1))}
        nextDisabled={offset === 0}
      />
      <p className="text-sm font-semibold text-white mb-3">By category</p>
      {!monthData ? (
        <p className="text-xs text-white/50 py-8 text-center flex-1">Loading…</p>
      ) : monthData.categories.length === 0 ? (
        <p className="text-xs text-white/50 py-8 text-center flex-1">No expenses this month.</p>
      ) : (
        <div className="flex-1 flex items-center gap-4">
          <DarkDonut categories={monthData.categories} total={monthData.total} />
          <ul className="flex-1 space-y-2 min-w-0">
            {monthData.categories.slice(0, 4).map((c, i) => (
              <li key={c.category} className="flex items-center gap-2">
                <span className="size-2 rounded-full shrink-0" style={{ background: paletteColor(i) }} />
                <span className="flex-1 min-w-0 text-[11px] text-white/80 truncate">{c.category}</span>
                <span className="text-[11px] font-semibold text-white/60 shrink-0">{Math.round(c.percent)}%</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function TopCategoriesPanel({ monthData, label, offset, setOffset }) {
  return (
    <section className="bg-white/5 rounded-2xl p-5 ring-1 ring-white/10 h-[228px] flex flex-col">
      <PeriodHeader
        label={label}
        onPrev={() => setOffset((o) => o + 1)}
        onNext={() => setOffset((o) => Math.max(0, o - 1))}
        nextDisabled={offset === 0}
      />
      <p className="text-sm font-semibold text-white mb-3">Top categories</p>
      {!monthData ? (
        <p className="text-xs text-white/50 py-8 text-center flex-1">Loading…</p>
      ) : monthData.categories.length === 0 ? (
        <p className="text-xs text-white/50 py-8 text-center flex-1">No expenses this month.</p>
      ) : (
        <div className="flex-1 space-y-3 overflow-y-auto">
          {monthData.categories.slice(0, 4).map((c, i) => (
            <div key={c.category}>
              <div className="flex justify-between mb-1">
                <span className="text-[11px] font-medium text-white/80">{c.category}</span>
                <span className="text-[11px] font-semibold text-white/60">{Math.round(c.percent)}%</span>
              </div>
              <div className="w-full bg-white/10 h-1.5 rounded-full overflow-hidden">
                <div className="h-full" style={{ width: `${c.percent}%`, background: paletteColor(i) }} />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

export default function HomeCarousel({ getMonthRows, ensureMonths }) {
  const now = new Date();
  const [weekOffset, setWeekOffset] = useState(0);
  // Shared between the "By category" and "Top categories" panels — arrows
  // in either one move both, per the owner's spec.
  const [catMonthOffset, setCatMonthOffset] = useState(0);
  const scrollerRef = useRef(null);
  const [active, setActive] = useState(0);

  const refMonday = addDays(mondayOf(now), -7 * weekOffset);
  const weekNeededMonths = (() => {
    const dates = [addDays(refMonday, -7), addDays(refMonday, -1), refMonday, addDays(refMonday, 6)];
    const seen = new Map();
    for (const d of dates) seen.set(monthKey(d), new Date(d.getFullYear(), d.getMonth(), 1));
    return [...seen.values()];
  })();
  const refCatMonth = new Date(now.getFullYear(), now.getMonth() - catMonthOffset, 1);

  useEffect(() => {
    ensureMonths(weekNeededMonths);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [weekOffset]);

  useEffect(() => {
    ensureMonths([refCatMonth]);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [catMonthOffset]);

  const weekReady = weekNeededMonths.every((d) => getMonthRows(d));
  const weekRows = weekReady ? weekNeededMonths.flatMap((d) => getMonthRows(d)) : null;
  const weekly = weekRows ? weeklyTotals(weekRows, refMonday) : null;

  const catRows = getMonthRows(refCatMonth);
  const monthData = catRows ? categoryTotals(catRows, refCatMonth) : null;
  const catMonthLabel =
    refCatMonth.getFullYear() === now.getFullYear()
      ? refCatMonth.toLocaleString("en-US", { month: "long" })
      : refCatMonth.toLocaleString("en-US", { month: "long", year: "numeric" });

  function handleScroll() {
    const el = scrollerRef.current;
    if (!el || !el.clientWidth) return;
    setActive(Math.round(el.scrollLeft / el.clientWidth));
  }

  const panels = [
    <WeeklyPanel key="weekly" weekly={weekly} weekOffset={weekOffset} setWeekOffset={setWeekOffset} refMonday={refMonday} />,
    <CategoryPanel key="category" monthData={monthData} label={catMonthLabel} offset={catMonthOffset} setOffset={setCatMonthOffset} />,
    <TopCategoriesPanel key="top" monthData={monthData} label={catMonthLabel} offset={catMonthOffset} setOffset={setCatMonthOffset} />,
  ];

  return (
    <div>
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
      <div className="flex justify-center gap-1.5 mt-3">
        {panels.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all ${i === active ? "w-4 bg-brand-teal" : "w-1.5 bg-white/20"}`}
          />
        ))}
      </div>
    </div>
  );
}
