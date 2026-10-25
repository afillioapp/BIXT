import { useEffect, useRef, useState } from "react";
import { dailyActivity, formatCurrency, monthsBetween } from "../lib/insights";

// The activity squares inside Home's top card: one square per day, green for
// money out, orange for money in, split corner to corner on days with both.
// The shade shows how much money moved, ranked within the period shown.
//
// Follows Home's Week / Month / Year tabs, their ‹ › arrows and the category
// pills (owner requests 2026-10-24):
//   Week  — 7 squares, day names underneath
//   Month — a small block per week (Monday on top, then Tue-Thu and Fri-Sun),
//           side by side, week dates underneath
//   Year  — the fiscal year GitHub-style (a column per week, a row per
//           weekday), fitted to the width, months underneath
//
// Tap a square for a small bubble with that day's money out and in; tap it
// again or anywhere else to close. Home wraps this in SwipeSlide, so dragging
// sideways slides to the previous or next period.

const SHADES = [0, 0.3, 0.5, 0.75, 1];
const WEEK_H = 42; // px: the Week squares' height (also the Year box)
const MONTH_GAP = 2;

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

export default function ActivityGraph({
  range,
  start,
  end,
  getMonthRows,
  ensureMonths,
  currency = "CAD",
  filterCategory = null,
}) {
  const months = monthsBetween(start, end);
  const periodKey = `${range}:${start.toDateString()}`;
  const [picked, setPicked] = useState(null);
  const rootRef = useRef(null);

  useEffect(() => {
    ensureMonths(months);
    setPicked(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodKey, filterCategory]);

  // Close the bubble on a tap anywhere else.
  useEffect(() => {
    if (picked === null) return;
    function away(e) {
      if (!e.target.closest?.("[data-activity-cell]")) setPicked(null);
    }
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [picked]);

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

  // align: where the bubble sits over its square so it never runs off the
  // card ("start" near the left edge, "end" near the right, else centred).
  function cell(day, i, className = "", align = "center", sizeStyle = null) {
    const future = day.date > today;
    const open = picked === i;
    const bubbleSide =
      align === "start" ? "left-0" : align === "end" ? "right-0" : "left-1/2 -translate-x-1/2";
    return (
      <span key={i} className="relative block">
        <button
          type="button"
          data-activity-cell
          disabled={future}
          aria-label={day.date.toDateString()}
          aria-expanded={open}
          onClick={() => setPicked(open ? null : i)}
          className={`block ${className} ${future ? "opacity-40" : ""} ${
            open ? "ring-2 ring-text-primary" : sameDay(day.date, today) ? "ring-1 ring-text-tertiary" : ""
          }`}
          style={{ background: !ready || future ? "var(--muted)" : cellBackground(day), ...sizeStyle }}
        />
        {open && (
          <span
            role="status"
            className={`absolute bottom-full mb-2 ${bubbleSide} z-30 whitespace-nowrap rounded-lg bg-text-primary px-2.5 py-1.5 text-[11px] leading-tight text-background shadow-lg pointer-events-none`}
          >
            <span className="font-semibold">
              {day.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
            </span>
            <br />
            {day.out || day.in
              ? [
                  day.out ? `${formatCurrency(day.out, { decimals: 2, currency })} out` : null,
                  day.in ? `${formatCurrency(day.in, { decimals: 2, currency })} in` : null,
                ]
                  .filter(Boolean)
                  .join(" · ")
              : "Nothing recorded"}
          </span>
        )}
      </span>
    );
  }

  const alignForColumn = (col, cols) => (col < cols * 0.25 ? "start" : col >= cols * 0.75 ? "end" : "center");

  let body;
  if (range === "Week") {
    body = (
      <>
        <div className="grid grid-cols-7 gap-2" style={{ height: WEEK_H }}>
          {days.map((d, i) => cell(d, i, "w-full h-[42px] rounded-[5px]", alignForColumn(i, 7)))}
        </div>
        <div className="grid grid-cols-7 gap-2 text-center mt-1.5">
          {days.map((d, i) => (
            <Label key={i} strong={sameDay(d.date, today)}>
              {d.date.toLocaleDateString("en-US", { weekday: "short" })}
            </Label>
          ))}
        </div>
      </>
    );
  } else if (range === "Month") {
    // One small block per week, side by side across the same box, each
    // week's first date underneath. Inside a block (owner's pick 2026-10-25):
    // Monday alone on top, then Tue-Thu and Fri-Sun underneath. Each day sits
    // in its weekday's spot, so a month starting mid-week leaves earlier
    // spots empty.
    const weeks = [];
    days.forEach((d, i) => {
      if (i === 0 || d.date.getDay() === 1) weeks.push([]);
      weeks[weeks.length - 1].push({ d, i });
    });
    const size = Math.floor((WEEK_H - 2 * MONTH_GAP) / 3);
    const spot = (d) => {
      const k = (d.date.getDay() + 6) % 7; // Mon 0 .. Sun 6
      return k === 0 ? { gridRow: 1, gridColumn: 2 } : { gridRow: 2 + Math.floor((k - 1) / 3), gridColumn: 1 + ((k - 1) % 3) };
    };
    body = (
      <div className="flex justify-between">
        {weeks.map((w, wi) => (
          <div key={wi} className="flex flex-col items-center">
            <div
              className="grid"
              style={{
                height: WEEK_H,
                gridTemplateRows: `repeat(3, ${size}px)`,
                gridTemplateColumns: `repeat(3, ${size}px)`,
                gap: MONTH_GAP,
                alignContent: "center",
              }}
            >
              {w.map(({ d, i }) => (
                <span key={i} style={spot(d)}>
                  {cell(d, i, "rounded-[3px]", alignForColumn(wi, weeks.length), { width: size, height: size })}
                </span>
              ))}
            </div>
            <div className="mt-1.5">
              <Label>{w[0].d.date.toLocaleDateString("en-US", { month: "short", day: "numeric" })}</Label>
            </div>
          </div>
        ))}
      </div>
    );
  } else {
    const lead = (start.getDay() + 6) % 7;
    const columns = Math.ceil((lead + days.length) / 7);
    body = (
      <>
        <div className="flex items-center" style={{ height: WEEK_H }}>
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
            {days.map((d, i) => cell(d, i, "w-full aspect-square rounded-[1px]", alignForColumn(Math.floor((lead + i) / 7), columns)))}
          </div>
        </div>
        <div className="relative mt-1.5 h-[14px]">
          {days.map((d, i) =>
            d.date.getDate() === 1 ? (
              <span key={i} className="absolute top-0" style={{ left: `${(Math.floor((lead + i) / 7) / columns) * 100}%` }}>
                <Label>{d.date.toLocaleString("en-US", { month: "short" })}</Label>
              </span>
            ) : null
          )}
        </div>
      </>
    );
  }

  return (
    <div
      ref={rootRef}
      role="group"
      aria-label={
        ready
          ? `Activity: ${formatCurrency(totals.out, { decimals: 2, currency })} out and ${formatCurrency(totals.in, {
              decimals: 2,
              currency,
            })} in this ${range.toLowerCase()}.`
          : "Loading activity"
      }
      className="select-none"
    >
      {body}
    </div>
  );
}
