// Pure helpers that turn raw expense rows (from lib/google.js listExpenseRows)
// into the shapes the dashboard needs. No Drive/network calls in here —
// keeps this file trivially testable and reusable between the dashboard and
// history page.

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// The exact category strings pages/api/extract.js's CATEGORIES list can
// return, mapped to a friendly icon. "Other" is also the fallback for rows
// saved before the Category column existed. The second block holds legacy
// aliases — pre-v1 names already written into users' sheets; never delete
// them or old receipts lose their icons.
export const CATEGORY_ICONS = {
  "Dining & Meals": "🍽️",
  "Coffee & Drinks": "☕",
  Travel: "✈️",
  "Ground Transport": "🚗",
  Fuel: "⛽",
  Accommodation: "🏨",
  "Office & Supplies": "📦",
  "Software & Tech": "💻",
  Marketing: "📢",
  "Professional Services": "💼",
  "Meetings & Events": "🎟️",
  Other: "📎",
  // Legacy aliases (pre-v1 rows)
  "Meals & Entertainment": "🍽️",
  "Office Supplies": "📦",
  "Software & Subscriptions": "💻",
  "Marketing & Advertising": "📢",
  Equipment: "📦",
  "Fuel & Vehicle": "⛽",
};

export function categoryIcon(category) {
  return CATEGORY_ICONS[category] || CATEGORY_ICONS.Other;
}

// Fixed per-category color (green-family for the top spenders, gray-green
// toward "Other") so a category always renders the same color regardless of
// rank or which categories are present this month. Identity never relies on
// color alone — the legend labels every slice — so near neighbors are OK.
export const CATEGORY_COLORS = {
  "Dining & Meals": "#22c55e",
  "Coffee & Drinks": "#4ade80",
  Travel: "#86efac",
  "Ground Transport": "#34d399",
  Fuel: "#16a34a",
  Accommodation: "#a7f3d0",
  "Office & Supplies": "#15803d",
  "Software & Tech": "#8fae9c",
  Marketing: "#059669",
  "Professional Services": "#6b7d72",
  "Meetings & Events": "#4b5b52",
  // Keep "Other" clearly visible against the #1a2420 card — it's often the
  // only slice (all pre-Category rows fall back to it).
  Other: "#5f7268",
  // Legacy aliases (pre-v1 rows)
  "Meals & Entertainment": "#22c55e",
  "Office Supplies": "#15803d",
  "Software & Subscriptions": "#8fae9c",
  "Marketing & Advertising": "#059669",
  Equipment: "#15803d",
  "Fuel & Vehicle": "#16a34a",
};

export function categoryColor(category) {
  return CATEGORY_COLORS[category] || CATEGORY_COLORS.Other;
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
