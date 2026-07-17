import { useRef, useState } from "react";
import { formatCurrency } from "../lib/insights";

// Interpolates between two "#rrggbb" hex colors at t (0..1).
function hexLerp(hexA, hexB, t) {
  const a = parseInt(hexA.slice(1), 16);
  const b = parseInt(hexB.slice(1), 16);
  const ar = (a >> 16) & 255, ag = (a >> 8) & 255, ab = a & 255;
  const br = (b >> 16) & 255, bg = (b >> 8) & 255, bb = b & 255;
  const r = Math.round(ar + (br - ar) * t);
  const g = Math.round(ag + (bg - ag) * t);
  const bl = Math.round(ab + (bb - ab) * t);
  return `#${[r, g, bl].map((v) => v.toString(16).padStart(2, "0")).join("")}`;
}

// Donut segment colors: a gradient ramp from teal (largest category) to
// navy (smallest/"Other"), walked in the size order categoryTotals()
// already returns — so every render's ramp adapts to however many
// categories are actually present this month. Hex equivalents of the
// oklch brand-teal/brand-navy tokens (see styles/globals.css --highlight/
// --accent), matching the hex lovable-design's own stats.tsx pairs with
// its bg-brand-teal/bg-brand-navy classes.
const DONUT_RAMP_START = "#0fb5a7";
const DONUT_RAMP_END = "#1e2a44";

function donutColorForIndex(i, count) {
  const t = count > 1 ? i / (count - 1) : 0;
  return hexLerp(DONUT_RAMP_START, DONUT_RAMP_END, t);
}

// Rounds up to a "nice" axis max (1/2/5/10 * 10^n) so gridlines land on
// round numbers instead of the raw week/month total.
function niceCeil(v) {
  if (v <= 0) return 50;
  const magnitude = Math.pow(10, Math.floor(Math.log10(v)));
  const residual = v / magnitude;
  let niceResidual;
  if (residual <= 1) niceResidual = 1;
  else if (residual <= 2) niceResidual = 2;
  else if (residual <= 5) niceResidual = 5;
  else niceResidual = 10;
  return niceResidual * magnitude;
}

const CHART_TOP = 36;
const CHART_BOTTOM = 130;
const CHART_HEIGHT = CHART_BOTTOM - CHART_TOP;

function WeeklyBarChart({ days }) {
  const maxAmount = Math.max(...days.map((d) => d.amount), 0);
  const niceMax = niceCeil(maxAmount);
  const barWidth = 20;
  const step = 40;
  const startX = 20;

  const gridLevels = [1, 2 / 3, 1 / 3].map((frac) => ({
    y: CHART_BOTTOM - frac * CHART_HEIGHT,
    label: formatCurrency(niceMax * frac),
  }));

  return (
    <svg viewBox="0 0 300 170" className="weekly-chart" role="img" aria-label="Spending Monday through Sunday this week">
      {gridLevels.map((g, i) => (
        <g key={i}>
          <line x1="0" x2="300" y1={g.y} y2={g.y} stroke="var(--border)" strokeWidth="1" />
          <text x="0" y={g.y - 4} fontSize="9" fill="var(--muted)">
            {g.label}
          </text>
        </g>
      ))}

      {days.map((day, i) => {
        const x = startX + i * step;
        const h = niceMax > 0 ? (day.amount / niceMax) * CHART_HEIGHT : 0;
        const y = CHART_BOTTOM - h;
        // Today gets the teal highlight per the navy/teal design system.
        const fill = day.isToday ? "var(--highlight)" : "var(--border)";
        return (
          <g key={day.label + i}>
            {day.isToday && day.amount > 0 && (
              <text x={x + barWidth / 2} y={y - 8} fontSize="10" fontWeight="700" fill="var(--highlight)" textAnchor="middle">
                {formatCurrency(day.amount)}
              </text>
            )}
            <rect
              x={x}
              y={y}
              width={barWidth}
              height={Math.max(h, 2)}
              rx="4"
              ry="4"
              fill={fill}
            >
              <title>
                {day.label}: {formatCurrency(day.amount)}
              </title>
            </rect>
            <text
              x={x + barWidth / 2}
              y={CHART_BOTTOM + 16}
              fontSize="10"
              fontWeight={day.isToday ? "700" : "400"}
              fill={day.isToday ? "var(--highlight)" : "var(--muted)"}
              textAnchor="middle"
            >
              {day.label}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

// "Jul 6 – 12" for a week inside one month; "Jun 29 – Jul 5" when it spans
// two (or, at year end, two years — the year only appears if it differs
// from the end date's year, kept off the common case to save space).
function formatWeekRange(start, end) {
  if (!start || !end) return "This week";
  const sameMonth = start.getMonth() === end.getMonth() && start.getFullYear() === end.getFullYear();
  const startFmt = start.toLocaleString("en-US", { month: "short", day: "numeric" });
  if (sameMonth) {
    return `${startFmt} – ${end.getDate()}`;
  }
  const sameYear = start.getFullYear() === end.getFullYear();
  const endFmt = end.toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    year: sameYear ? undefined : "numeric",
  });
  return `${startFmt} – ${endFmt}`;
}

function WeeklyCard({ weekly }) {
  const { days, percentChange, weekStart, weekEnd } = weekly;
  let changeLabel = "—";
  let changeClass = "flat";
  if (percentChange !== null) {
    const rounded = Math.round(Math.abs(percentChange));
    if (percentChange > 0) {
      changeLabel = `▲ ${rounded}%`;
      changeClass = "up";
    } else if (percentChange < 0) {
      changeLabel = `▼ ${rounded}%`;
      changeClass = "down";
    } else {
      changeLabel = "0%";
    }
  }

  return (
    <div className="insight-card">
      <span className="insight-card-tag">Weekly expenses</span>
      <div className="insight-card-header">
        <span className="insight-card-title">{formatWeekRange(weekStart, weekEnd)}</span>
        <span className={`insight-card-change ${changeClass}`}>{changeLabel}</span>
      </div>
      <WeeklyBarChart days={days} />
    </div>
  );
}

function CategoryDonut({ categories, total }) {
  const size = 120;
  const radius = 46;
  const strokeWidth = 18;
  const cx = size / 2;
  const cy = size / 2;
  const circumference = 2 * Math.PI * radius;

  let offsetAccum = 0;
  const arcs = categories.map((c, i) => {
    const length = (c.percent / 100) * circumference;
    const arc = { ...c, length, offset: offsetAccum, color: donutColorForIndex(i, categories.length) };
    offsetAccum += length;
    return arc;
  });

  return (
    <svg viewBox={`0 0 ${size} ${size}`} width={size} height={size} role="img" aria-label="Spending by category this month">
      <circle cx={cx} cy={cy} r={radius} fill="none" stroke="var(--border)" strokeWidth={strokeWidth} />
      {arcs.map((arc, i) => (
        <circle
          key={arc.category + i}
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={arc.color}
          strokeWidth={strokeWidth}
          strokeDasharray={`${Math.max(arc.length - 2, 0)} ${circumference - arc.length + 2}`}
          strokeDashoffset={-arc.offset}
          transform={`rotate(-90 ${cx} ${cy})`}
          strokeLinecap="butt"
        >
          <title>
            {arc.category}: {formatCurrency(arc.amount)} ({Math.round(arc.percent)}%)
          </title>
        </circle>
      ))}
      <text x={cx} y={cy - 4} fontSize="9" fill="var(--muted)" textAnchor="middle">
        Total
      </text>
      <text x={cx} y={cy + 10} fontSize="13" fontWeight="700" fill="var(--text)" textAnchor="middle">
        {formatCurrency(total)}
      </text>
    </svg>
  );
}

function CategoryCard({ categoryData, monthTag }) {
  const { categories, total } = categoryData;

  return (
    <div className="insight-card">
      <span className="insight-card-tag">By category</span>
      <div className="insight-card-header">
        <span className="insight-card-title">{monthTag}</span>
      </div>

      {categories.length === 0 ? (
        <div className="empty-state-sub" style={{ padding: "20px 0" }}>
          No expenses yet this month.
        </div>
      ) : (
        <div className="donut-wrap">
          {/* Donut centered above, legend in a compact 2-col wrap below —
              no icons/emoji, just a color dot + name + %. */}
          <CategoryDonut categories={categories} total={total} />
          <div className="donut-legend">
            {categories.map((c, i) => (
              <div className="donut-legend-row" key={c.category}>
                <span
                  className="donut-legend-swatch"
                  style={{ background: donutColorForIndex(i, categories.length) }}
                  aria-hidden="true"
                />
                <span className="donut-legend-name">{c.category}</span>
                <span className="donut-legend-percent">{Math.round(c.percent)}%</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Third carousel panel — no data behind it yet, just holds the slot per the
// design handoff ("Coming soon" / "More insights on the way.").
function ComingSoonCard() {
  return (
    <div className="insight-card insight-card-soon">
      <span className="insight-card-tag">Coming soon</span>
      <div className="insight-card-soon-text">More insights on the way.</div>
    </div>
  );
}

// Horizontally swipeable, one card per view (CSS scroll-snap), with dot
// indicators driven by scroll position.
export default function InsightCards({ weekly, categoryData, monthTag }) {
  const scrollRef = useRef(null);
  const [active, setActive] = useState(0);
  const cardCount = 3;

  function handleScroll() {
    const el = scrollRef.current;
    if (!el || !el.clientWidth) return;
    const index = Math.round(el.scrollLeft / el.clientWidth);
    setActive(Math.min(Math.max(index, 0), cardCount - 1));
  }

  return (
    <div className="insight-cards-wrap">
      <div className="insight-cards-scroll" ref={scrollRef} onScroll={handleScroll}>
        <WeeklyCard weekly={weekly} />
        <CategoryCard categoryData={categoryData} monthTag={monthTag} />
        <ComingSoonCard />
      </div>
      <div className="insight-dots">
        {Array.from({ length: cardCount }).map((_, i) => (
          <span key={i} className={`insight-dot ${i === active ? "active" : ""}`} />
        ))}
      </div>
    </div>
  );
}
