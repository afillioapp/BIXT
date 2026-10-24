import { useEffect } from "react";
import { dailyActivity, formatCurrency, monthsBetween } from "../lib/insights";

// The activity squares inside Home's top card: one square per day, green for
// money out, orange for money in, split corner to corner on days with both.
// The shade shows how much money moved, ranked within the period shown.
//
// Follows Home's Week / Month / Year tabs and their ‹ › arrows. All three
// views fill the SAME box (owner request 2026-10-24): the Week view's size is
// the reference, and the squares shrink to fit more days into it.
//   Week  — 7 squares, day names underneath
//   Month — every day in one row, a small gap between weeks, each week's
//           start date underneath
//   Year  — the fiscal year GitHub-style (a column per week, a row per
//           weekday), fitted to the width with no scrolling, months underneath
//
// No title, legend or numbers: the card's total says the money. Follows the
// category filter like the rest of Home.

const SHADES = [0, 0.3, 0.5, 0.75, 1];
const CELLS_H = 42; // px: the square area, shared by all three views
const LABELS_H = 14; // px: the label line under it

function shade(color, level) {
  return `color-mix(in oklch, ${color} ${Math.round(SHADES[level] * 100)}%, transparent)`;
}

function cellBackground(day) {
  const out = day.outLevel ? shade("var(--activity-out)", day.outLevel) : null;
  const inn = day.inLevel ? shade("var(--activity-in)", day.inLevel) : null;
  if (out && inn) return `linear-gradient(135deg, ${out} 50%, ${inn} 50%)`;
  return out || inn || "var(--muted)";
}

function sameDay(a, b) {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

function Label({ children, strong = false }) {
  return (
    <span
      className={`block text-[10px] leading-[14px] whitespace-nowrap ${
        strong ? "font-semibold text-text-primary" : "text-text-tertiary"
      }`}
    >
      {children}
    </span>
  );
}

export default function ActivityGraph({ range, start, end, getMonthRows, ensureMonths, currency = "CAD", filterCategory = null }) {
  const months = monthsBetween(start, end);
  const periodKey = `${range}:${start.toDateString()}`;

  useEffect(() => {
    ensureMonths(months);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodKey]);

  const ready = months.every((d) => getMonthRows(d));
  // Home's category pills narrow the squares too: with "Fuel" picked, only
  // Fuel receipts count, and shades rank among Fuel days.
  const rows = ready
    ? months
        .flatMap((d) => getMonthRows(d))
        .filter((r) => !filterCategory || (r.category || "Other") === filterCategory)
    : [];
  const { days, totals } = dailyActivity(rows, start, end);

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  function cell(day, i, className = "") {
    const future = day.date > today;
    return (
      <span
        key={i}
        title={future ? undefined : day.date.toDateString()}
        className={`block ${className} ${future ? "opacity-40" : ""} ${
          sameDay(day.date, today) ? "ring-1 ring-text-tertiary" : ""
        }`}
        style={{ background: !ready || future ? "var(--muted)" : cellBackground(day) }}
      />
    );
  }

  let cells;
  let labels;

  if (range === "Week") {
    cells = <div className="grid grid-cols-7 gap-2 h-full">{days.map((d, i) => cell(d, i, "h-full rounded-[5px]"))}</div>;
    labels = (
      <div className="grid grid-cols-7 gap-2 text-center">
        {days.map((d, i) => (
          <Label key={i} strong={sameDay(d.date, today)}>
            {d.date.toLocaleDateString("en-US", { weekday: "short" })}
          </Label>
        ))}
      </div>
    );
  } else if (range === "Month") {
    // Monday-first weeks, each a group of squares with a gap between groups.
    const weeks = [];
    days.forEach((d, i) => {
      if (i === 0 || d.date.getDay() === 1) weeks.push([]);
      weeks[weeks.length - 1].push({ d, i });
    });
    cells = (
      <div className="flex items-center gap-1.5 h-full">
        {weeks.map((w, wi) => (
          <div key={wi} className="flex gap-0.5 min-w-0" style={{ flex: w.length }}>
            {w.map(({ d, i }) => cell(d, i, "flex-1 min-w-0 aspect-square rounded-[2px]"))}
          </div>
        ))}
      </div>
    );
    labels = (
      <div className="flex gap-1.5">
        {weeks.map((w, wi) => (
          <div key={wi} className="min-w-0" style={{ flex: w.length }}>
            <Label>{w[0].d.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</Label>
          </div>
        ))}
      </div>
    );
  } else {
    const lead = (start.getDay() + 6) % 7; // blank squares before a Monday-first week
    const columns = Math.ceil((lead + days.length) / 7);
    cells = (
      <div className="h-full flex items-center">
        <div
          className="grid grid-flow-col w-full"
          style={{
            gridTemplateRows: "repeat(7, auto)",
            gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
            gap: 1,
          }}
        >
          {Array.from({ length: lead }, (_, i) => (
            <span key={`lead-${i}`} />
          ))}
          {days.map((d, i) => cell(d, i, "aspect-square rounded-[1px]"))}
        </div>
      </div>
    );
    labels = (
      <div className="relative h-full">
        {days.map((d, i) =>
          d.date.getDate() === 1 ? (
            <span key={i} className="absolute top-0" style={{ left: `${(Math.floor((lead + i) / 7) / columns) * 100}%` }}>
              <Label>{d.date.toLocaleString("en-US", { month: "short" })}</Label>
            </span>
          ) : null
        )}
      </div>
    );
  }

  return (
    <div
      role="img"
      aria-label={
        ready
          ? `${formatCurrency(totals.out, { decimals: 2, currency })} out and ${formatCurrency(totals.in, {
              decimals: 2,
              currency,
            })} in this ${range.toLowerCase()}.`
          : "Loading activity"
      }
    >
      <div style={{ height: CELLS_H }}>{cells}</div>
      <div className="mt-1.5 overflow-hidden text-[10px] leading-none" style={{ height: LABELS_H }}>
        {labels}
      </div>
    </div>
  );
}
