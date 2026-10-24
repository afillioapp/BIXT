import { useEffect, useRef, useState } from "react";
import { dailyActivity, formatCurrency, monthsBetween } from "../lib/insights";

// The activity squares inside Home's top card (owner request 2026-10-24,
// reworked the same day): one square per day, green for money out, orange
// for money in, split corner to corner on days with both. The shade shows how
// much money moved, ranked within the period shown.
//
// It follows Home's Week / Month / Year tabs and their ‹ › arrows:
//   Week  — the 7 days in a row
//   Month — a calendar: a row per week, a column per weekday
//   Year  — the fiscal year GitHub-style (a column per week), scrolling
//           sideways and opening on the current week
//
// No title or legend. The line underneath carries the period's money out and
// in (in their colours, which doubles as the key) and, after a tap, that day.

const SHADES = [0, 0.3, 0.5, 0.75, 1];
const DAY_LETTERS = ["M", "T", "W", "T", "F", "S", "S"];
const YEAR_CELL = 12;
const YEAR_GAP = 3;
const YEAR_PITCH = YEAR_CELL + YEAR_GAP;
// The square colours are too light for small text on a white card; mixing in
// the text colour keeps the hue and clears contrast in both themes.
const TEXT_OUT = "color-mix(in srgb, var(--activity-out) 70%, var(--text-primary))";
const TEXT_IN = "color-mix(in srgb, var(--activity-in) 70%, var(--text-primary))";

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

export default function ActivityGraph({ range, start, end, getMonthRows, ensureMonths, currency = "CAD" }) {
  const months = monthsBetween(start, end);
  const periodKey = `${range}:${start.toDateString()}`;
  const [picked, setPicked] = useState(null);
  const scrollerRef = useRef(null);

  useEffect(() => {
    ensureMonths(months);
    setPicked(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [periodKey]);

  const ready = months.every((d) => getMonthRows(d));
  const rows = ready ? months.flatMap((d) => getMonthRows(d)) : [];
  const { days, totals } = dailyActivity(rows, start, end);

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const isFuture = (d) => d.date > today;
  const lead = (start.getDay() + 6) % 7; // blank squares before a Monday-first week

  function cell(day, i, className = "") {
    const future = isFuture(day);
    const isToday = sameDay(day.date, today);
    return (
      <button
        key={i}
        type="button"
        disabled={future}
        aria-label={day.date.toDateString()}
        aria-pressed={picked === i}
        onClick={() => setPicked(picked === i ? null : i)}
        className={`rounded-[4px] ${className} ${future ? "opacity-40" : ""} ${
          picked === i ? "ring-2 ring-text-primary" : isToday ? "ring-1 ring-text-tertiary" : ""
        }`}
        style={{ background: !ready || future ? "var(--muted)" : cellBackground(day) }}
      />
    );
  }

  // Year: open on the current week.
  const todayIndex = days.findIndex((d) => sameDay(d.date, today));
  const todayColumn = todayIndex === -1 ? 0 : Math.floor((lead + todayIndex) / 7);
  useEffect(() => {
    const el = scrollerRef.current;
    if (range !== "Year" || !el) return;
    el.scrollLeft = Math.max(0, (todayColumn + 2) * YEAR_PITCH - el.clientWidth);
  }, [range, todayColumn, ready]);

  let grid;
  if (range === "Week") {
    grid = (
      <div className="grid grid-cols-7 gap-2">
        {days.map((d, i) => (
          <div key={i} className="flex flex-col items-center gap-1.5">
            {cell(d, i, "w-full aspect-square max-h-11")}
            <span className={`text-[10px] ${sameDay(d.date, today) ? "font-semibold text-text-primary" : "text-text-tertiary"}`}>
              {d.date.toLocaleDateString("en-US", { weekday: "short" })}
            </span>
          </div>
        ))}
      </div>
    );
  } else if (range === "Month") {
    grid = (
      <div>
        <div className="grid grid-cols-7 gap-1.5 mb-1.5" aria-hidden="true">
          {DAY_LETTERS.map((l, i) => (
            <span key={i} className="text-center text-[10px] text-text-tertiary">
              {l}
            </span>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1.5">
          {Array.from({ length: lead }, (_, i) => (
            <span key={`lead-${i}`} />
          ))}
          {days.map((d, i) => cell(d, i, "w-full h-6"))}
        </div>
      </div>
    );
  } else {
    const columns = Math.ceil((lead + days.length) / 7);
    const monthLabels = days
      .map((d, i) =>
        d.date.getDate() === 1 ? { col: Math.floor((lead + i) / 7), text: d.date.toLocaleString("en-US", { month: "short" }) } : null
      )
      .filter(Boolean);
    grid = (
      <div ref={scrollerRef} className="overflow-x-auto scrollbar-none" style={{ scrollbarWidth: "none" }}>
        <div style={{ width: columns * YEAR_PITCH }}>
          <div className="relative h-4 text-[9px] text-text-tertiary" aria-hidden="true">
            {monthLabels.map((m) => (
              <span key={`${m.col}-${m.text}`} className="absolute top-0" style={{ left: m.col * YEAR_PITCH }}>
                {m.text}
              </span>
            ))}
          </div>
          <div
            className="grid grid-flow-col"
            style={{ gridTemplateRows: `repeat(7, ${YEAR_CELL}px)`, gridAutoColumns: `${YEAR_CELL}px`, gap: YEAR_GAP }}
          >
            {Array.from({ length: lead }, (_, i) => (
              <span key={`lead-${i}`} />
            ))}
            {days.map((d, i) => cell(d, i, "!rounded-[3px]"))}
          </div>
        </div>
      </div>
    );
  }

  const shown = picked !== null ? days[picked] : null;
  const amounts = shown || totals;

  return (
    <div>
      {grid}
      <p className="mt-3 text-[11px] text-text-secondary" role="status">
        {!ready ? (
          "Loading…"
        ) : (
          <>
            {shown && (
              <span className="text-text-primary font-medium">
                {shown.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}:{" "}
              </span>
            )}
            <span className="font-semibold" style={{ color: TEXT_OUT }}>
              {formatCurrency(amounts.out, { decimals: 2, currency })}
            </span>{" "}
            out
            {" · "}
            <span className="font-semibold" style={{ color: TEXT_IN }}>
              {formatCurrency(amounts.in, { decimals: 2, currency })}
            </span>{" "}
            in
          </>
        )}
      </p>
    </div>
  );
}
