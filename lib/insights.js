// Pure helpers that turn raw expense rows (from lib/google.js listExpenseRows)
// into the shapes the dashboard needs. No Drive/network calls in here —
// keeps this file trivially testable and reusable between the dashboard and
// history page.

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Category icon system (design_handoff_bxt_app, adapted for the official
// 12-category list in pages/api/extract.js's CATEGORIES — the handoff's own
// list of 9 was stale). Each category renders as a flat-color 40x40 square
// with 2-letter initials instead of an emoji. Fills are an even 12-step
// grayscale ramp from the handoff's darkest tint (#111111) to its lightest
// (#E4E4E4), walked in official-category order, with white text on the
// darker-than-~#8A8A8A half and dark text on the lighter half — the same
// rule the handoff used for its own 9-tint scale.
//
// "Other" is also the fallback for rows saved before the Category column
// existed. The legacy-alias block holds pre-v1 category names already
// written into users' sheets; each maps onto the visual of its closest
// successor in the new list — never delete these or old receipts lose their
// icons.
export const CATEGORY_ICONS = {
  "Dining & Meals": { initials: "DM", bg: "#111111", fg: "#FFFFFF" },
  "Coffee & Drinks": { initials: "CD", bg: "#242424", fg: "#FFFFFF" },
  Travel: { initials: "TR", bg: "#373737", fg: "#FFFFFF" },
  "Ground Transport": { initials: "GT", bg: "#4B4B4B", fg: "#FFFFFF" },
  Fuel: { initials: "FU", bg: "#5E5E5E", fg: "#FFFFFF" },
  Accommodation: { initials: "AC", bg: "#717171", fg: "#FFFFFF" },
  "Office & Supplies": { initials: "OS", bg: "#848484", fg: "#FFFFFF" },
  "Software & Tech": { initials: "SW", bg: "#979797", fg: "#111111" },
  Marketing: { initials: "MA", bg: "#AAAAAA", fg: "#111111" },
  "Professional Services": { initials: "PS", bg: "#BEBEBE", fg: "#111111" },
  "Meetings & Events": { initials: "EV", bg: "#D1D1D1", fg: "#111111" },
  Other: { initials: "OT", bg: "#E4E4E4", fg: "#111111" },
  // Legacy aliases (pre-v1 rows) -> successor category's visual
  "Meals & Entertainment": { initials: "DM", bg: "#111111", fg: "#FFFFFF" }, // -> Dining & Meals
  "Office Supplies": { initials: "OS", bg: "#848484", fg: "#FFFFFF" }, // -> Office & Supplies
  "Software & Subscriptions": { initials: "SW", bg: "#979797", fg: "#111111" }, // -> Software & Tech
  "Marketing & Advertising": { initials: "MA", bg: "#AAAAAA", fg: "#111111" }, // -> Marketing
  Equipment: { initials: "OS", bg: "#848484", fg: "#FFFFFF" }, // -> Office & Supplies
  "Fuel & Vehicle": { initials: "FU", bg: "#5E5E5E", fg: "#FFFFFF" }, // -> Fuel
};

function categoryVisual(category) {
  return CATEGORY_ICONS[category] || CATEGORY_ICONS.Other;
}

// Kept the name/signature callers already use (pages/index.js,
// pages/history.js) — now returns the 2-letter initials shown on the
// category icon square instead of an emoji.
export function categoryIcon(category) {
  return categoryVisual(category).initials;
}

// Fixed per-category fill color (see CATEGORY_ICONS above) so a category
// always renders the same swatch regardless of rank or which categories are
// present this month. Identity never relies on color alone — the legend
// labels every slice — so near neighbors are OK. Kept the name/signature
// components/InsightCards.js already uses.
export function categoryColor(category) {
  return categoryVisual(category).bg;
}

// Text color to pair with categoryColor's fill for the category icon square
// — white on the darker-than-~#8A8A8A half of the ramp, dark ink on the
// lighter half.
export function categoryTextColor(category) {
  return categoryVisual(category).fg;
}

// Whole-dollar by default (compact for chart labels); pass decimals:2 for a
// precise total.
export function formatCurrency(amount, { decimals = 0 } = {}) {
  const n = Number(amount) || 0;
  return `$${n.toLocaleString("en-US", {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
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

// Monday-start week (Mon..Sun) containing `date`, at midnight.
function weekRange(date) {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  const dow = d.getDay(); // 0 Sun .. 6 Sat
  const diffToMonday = (dow + 6) % 7; // Mon -> 0
  const monday = new Date(d);
  monday.setDate(d.getDate() - diffToMonday);
  const sunday = new Date(monday);
  sunday.setDate(monday.getDate() + 6);
  return { start: monday, end: sunday };
}

// Mon–Sun totals for the current week (bucketed per day, for the bar chart)
// plus the current/previous week totals and the % change between them.
// percentChange is null when the previous week was $0 (render as "—").
export function weeklyTotals(rows, now = new Date()) {
  const { start: curStart, end: curEnd } = weekRange(now);
  const prevStart = new Date(curStart);
  prevStart.setDate(curStart.getDate() - 7);
  const prevEnd = new Date(curEnd);
  prevEnd.setDate(curEnd.getDate() - 7);

  const todayKey = new Date(now.getFullYear(), now.getMonth(), now.getDate()).toDateString();

  const days = DAY_LABELS.map((label, i) => {
    const d = new Date(curStart);
    d.setDate(curStart.getDate() + i);
    return { label, key: d.toDateString(), amount: 0, isToday: d.toDateString() === todayKey };
  });

  let currentTotal = 0;
  let previousTotal = 0;

  for (const r of rows || []) {
    const d = parseRowDate(r.date);
    if (!d) continue;
    const amount = parseAmount(r.total);
    if (d >= curStart && d <= curEnd) {
      currentTotal += amount;
      const day = days.find((x) => x.key === d.toDateString());
      if (day) day.amount += amount;
    } else if (d >= prevStart && d <= prevEnd) {
      previousTotal += amount;
    }
  }

  const percentChange = previousTotal > 0 ? ((currentTotal - previousTotal) / previousTotal) * 100 : null;

  return {
    days: days.map(({ label, amount, isToday }) => ({ label, amount, isToday })),
    total: currentTotal,
    previousTotal,
    percentChange,
  };
}

// Current-month spend grouped by category, sorted highest first, with each
// category's % share of the month's total.
export function categoryTotals(rows, now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const totals = new Map();
  let total = 0;

  for (const r of rows || []) {
    const d = parseRowDate(r.date);
    if (!d || d.getFullYear() !== year || d.getMonth() !== month) continue;
    const amount = parseAmount(r.total);
    const cat = r.category || "Other";
    totals.set(cat, (totals.get(cat) || 0) + amount);
    total += amount;
  }

  const categories = Array.from(totals.entries())
    .map(([category, amount]) => ({
      category,
      amount,
      percent: total > 0 ? (amount / total) * 100 : 0,
    }))
    .sort((a, b) => b.amount - a.amount);

  return { total, categories };
}

// Most recent n receipts across whatever rows were passed in (not assumed
// to be pre-sorted).
export function latestReceipts(rows, n = 4) {
  return [...(rows || [])]
    .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
    .slice(0, n);
}
