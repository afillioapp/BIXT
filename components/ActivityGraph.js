import { useEffect, useMemo, useRef, useState } from "react";
import { dailyActivity, fiscalYear, formatCurrency } from "../lib/insights";

// GitHub-style activity grid for the business's current fiscal year (owner
// request 2026-10-24): one square per day, a column per week (Mon-Sun).
// Money out and money in each have their own colour, and the shade shows how
// much moved that day (four grades, ranked within the year — see
// dailyActivity). A day with both is split corner to corner.
//
// The year is wider than a phone, so the grid scrolls sideways and opens on
// the current week. Tapping a square spells out that day underneath, since
// there is no hover on a phone.

const CELL = 12; // px
const GAP = 3; // px
const PITCH = CELL + GAP;
const SHADES = [0, 0.3, 0.5, 0.75, 1]; // opacity per level 1-4

function shade(color, level) {
  return `color-mix(in oklch, ${color} ${Math.round(SHADES[level] * 100)}%, transparent)`;
}

function cellBackground(day, isFuture) {
  if (isFuture) return "transparent";
  const out = day.outLevel ? shade("var(--activity-out)", day.outLevel) : null;
  const inn = day.inLevel ? shade("var(--activity-in)", day.inLevel) : null;
  if (out && inn) return `linear-gradient(135deg, ${out} 50%, ${inn} 50%)`;
  return out || inn || "var(--muted)";
}

function Legend({ color, label }) {
  return (
    <span className="flex items-center gap-1.5">
      <span className="flex gap-0.5" aria-hidden="true">
        {[1, 2, 3, 4].map((l) => (
          <span key={l} className="size-2.5 rounded-[3px]" style={{ background: shade(color, l) }} />
        ))}
      </span>
      {label}
    </span>
  );
}

export default function ActivityGraph({ getMonthRows, ensureMonths, fiscalStart = 1, currency = "CAD" }) {
  const fy = fiscalYear(fiscalStart, 0);
  const scrollerRef = useRef(null);
  const [picked, setPicked] = useState(null);

  useEffect(() => {
    ensureMonths(fy.months);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fiscalStart]);

  const ready = fy.months.every((d) => getMonthRows(d));
  const rows = ready ? fy.months.flatMap((d) => getMonthRows(d)) : null;
  const { days, totals } = useMemo(() => dailyActivity(rows || [], fy.months), [rows, fiscalStart]); // eslint-disable-line react-hooks/exhaustive-deps

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  // Monday-first rows; the first column starts on the Monday on or before
  // the fiscal year's first day, so earlier squares in it stay empty.
  const lead = days.length ? (days[0].date.getDay() + 6) % 7 : 0;
  const columns = Math.ceil((lead + days.length) / 7);
  const todayIndex = days.findIndex((d) => d.date.getTime() === today.getTime());
  const todayColumn = todayIndex === -1 ? columns - 1 : Math.floor((lead + todayIndex) / 7);

  // Month labels sit over the column holding each month's 1st.
  const monthLabels = days
    .map((d, i) => (d.date.getDate() === 1 ? { col: Math.floor((lead + i) / 7), text: d.date.toLocaleString("en-US", { month: "short" }) } : null))
    .filter(Boolean);

  // Open on the current week: keep today a little in from the right edge.
  useEffect(() => {
    const el = scrollerRef.current;
    if (!el || !ready) return;
    el.scrollLeft = Math.max(0, (todayColumn + 2) * PITCH - el.clientWidth);
  }, [ready, todayColumn]);

  const pickedDay = picked !== null ? days[picked] : null;

  return (
    <section className="bg-card rounded-2xl p-5 ring-1 ring-hairline">
      <div className="flex items-baseline justify-between gap-3 mb-1">
        <h2 className="text-sm font-semibold">Activity</h2>
        <p className="text-[11px] text-text-secondary whitespace-nowrap">{fy.label}</p>
      </div>
      <p className="text-[11px] text-text-secondary mb-3">
        {ready ? (
          <>
            <span className="font-semibold text-text-primary">{formatCurrency(totals.out, { currency })}</span> out
            {" · "}
            <span className="font-semibold text-text-primary">{formatCurrency(totals.in, { currency })}</span> in
          </>
        ) : (
          "Loading…"
        )}
      </p>

      <div className="flex gap-1.5">
        {/* Day names stay put while the weeks scroll. */}
        <div
          className="shrink-0 grid text-[9px] leading-none text-text-tertiary pt-4"
          style={{ gridTemplateRows: `repeat(7, ${CELL}px)`, rowGap: GAP }}
          aria-hidden="true"
        >
          {["Mon", "", "Wed", "", "Fri", "", ""].map((d, i) => (
            <span key={i} className="flex items-center">{d}</span>
          ))}
        </div>

        <div ref={scrollerRef} className="overflow-x-auto scrollbar-none min-w-0" style={{ scrollbarWidth: "none" }}>
          <div style={{ width: columns * PITCH }}>
            <div className="relative h-4 text-[9px] text-text-tertiary" aria-hidden="true">
              {monthLabels.map((m) => (
                <span key={`${m.col}-${m.text}`} className="absolute top-0" style={{ left: m.col * PITCH }}>
                  {m.text}
                </span>
              ))}
            </div>
            <div
              role="img"
              aria-label={`Activity for ${fy.label}: ${formatCurrency(totals.out, { currency })} out, ${formatCurrency(totals.in, { currency })} in.`}
              className="grid grid-flow-col"
              style={{ gridTemplateRows: `repeat(7, ${CELL}px)`, gridAutoColumns: `${CELL}px`, gap: GAP }}
              onClick={(e) => {
                const i = e.target?.dataset?.i;
                if (i !== undefined) setPicked(Number(i) === picked ? null : Number(i));
              }}
            >
              {Array.from({ length: lead }, (_, i) => (
                <span key={`lead-${i}`} />
              ))}
              {days.map((d, i) => {
                const future = d.date > today;
                return (
                  <span
                    key={i}
                    data-i={future ? undefined : i}
                    title={future ? undefined : d.date.toDateString()}
                    className={`rounded-[3px] ${future ? "" : "cursor-pointer"} ${picked === i ? "ring-2 ring-text-primary" : ""} ${
                      i === todayIndex ? "outline outline-1 outline-offset-1 outline-text-tertiary" : ""
                    }`}
                    style={{ background: ready ? cellBackground(d, future) : future ? "transparent" : "var(--muted)" }}
                  />
                );
              })}
            </div>
          </div>
        </div>
      </div>

      <p className="text-[11px] text-text-secondary mt-3 min-h-4" role="status">
        {pickedDay
          ? `${pickedDay.date.toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}: ${
              pickedDay.out || pickedDay.in
                ? [
                    pickedDay.out ? `${formatCurrency(pickedDay.out, { decimals: 2, currency })} out` : null,
                    pickedDay.in ? `${formatCurrency(pickedDay.in, { decimals: 2, currency })} in` : null,
                  ]
                    .filter(Boolean)
                    .join(", ")
                : "nothing recorded"
            }`
          : ""}
      </p>

      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 mt-1 text-[10px] text-text-secondary">
        <Legend color="var(--activity-out)" label="Money out" />
        <Legend color="var(--activity-in)" label="Money in" />
        <span className="text-text-tertiary">Darker = more money</span>
      </div>
    </section>
  );
}
