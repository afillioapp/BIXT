// Pure helpers that turn raw expense rows (from lib/google.js listExpenseRows)
// into the shapes the dashboard needs. No Drive/network calls in here —
// keeps this file trivially testable and reusable between the dashboard and
// history page.

const DAY_LABELS = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// Category icon system (adapted for the official 12-category list in
// pages/api/extract.js's CATEGORIES). Each category renders as an emoji on
// a neutral surface square (see .receipt-icon in styles/globals.css) instead
// of the old flat-color-square + 2-letter-initials treatment.
//
// "Other" is also the fallback for rows saved before the Category column
// existed. The legacy-alias block holds pre-v1 category names already
// written into users' sheets; each maps onto its closest successor in the
// new list — never delete these or old receipts lose their icons.
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
  // Legacy aliases (pre-v1 rows) -> successor category's icon
  "Meals & Entertainment": "🍽️", // -> Dining & Meals
  "Office Supplies": "📦", // -> Office & Supplies
  "Software & Subscriptions": "💻", // -> Software & Tech
  "Marketing & Advertising": "📢", // -> Marketing
  Equipment: "📦", // -> Office & Supplies
  "Fuel & Vehicle": "⛽", // -> Fuel
};

// Grayscale ramp used by the "By category" donut (components/InsightCards.js)
// to give each category a consistent, distinguishable fill — unrelated to
// the emoji above. Kept until the donut's own gradient ramp replaces it.
const CATEGORY_COLOR_RAMP = {
  "Dining & Meals": "#111111",
  "Coffee & Drinks": "#242424",
  Travel: "#373737",
  "Ground Transport": "#4B4B4B",
  Fuel: "#5E5E5E",
  Accommodation: "#717171",
  "Office & Supplies": "#848484",
  "Software & Tech": "#979797",
  Marketing: "#AAAAAA",
  "Professional Services": "#BEBEBE",
  "Meetings & Events": "#D1D1D1",
  Other: "#E4E4E4",
  "Meals & Entertainment": "#111111",
  "Office Supplies": "#848484",
  "Software & Subscriptions": "#979797",
  "Marketing & Advertising": "#AAAAAA",
  Equipment: "#848484",
  "Fuel & Vehicle": "#5E5E5E",
};

// Kept the name/signature callers already use (pages/index.js,
// pages/history.js) — returns the category's emoji.
export function categoryIcon(category) {
  return CATEGORY_ICONS[category] || CATEGORY_ICONS.Other;
}

// Fixed per-category fill color so a category always renders the same
// swatch regardless of rank or which categories are present this month.
// Identity never relies on color alone — the legend labels every slice —
// so near neighbors are OK. Kept the name/signature
// components/InsightCards.js already uses.
export function categoryColor(category) {
  return CATEGORY_COLOR_RAMP[category] || CATEGORY_COLOR_RAMP.Other;
}

// Currencies offered in Settings. The profile stores the code; "CAD" is the
// default (BX started with Canadian HST receipts).
export const CURRENCIES = [
  { code: "CAD", label: "Canadian dollar" },
  { code: "USD", label: "US dollar" },
  { code: "EUR", label: "Euro" },
  { code: "GBP", label: "British pound" },
  { code: "AUD", label: "Australian dollar" },
  { code: "NZD", label: "New Zealand dollar" },
  { code: "CHF", label: "Swiss franc" },
  { code: "INR", label: "Indian rupee" },
  { code: "AED", label: "UAE dirham" },
  { code: "MXN", label: "Mexican peso" },
  { code: "JPY", label: "Japanese yen" },
];

export function currencyCode(profile) {
  const c = profile?.currency;
  return CURRENCIES.some((x) => x.code === c) ? c : "CAD";
}

// The symbol people expect on a price tag ("$", "€", "£"), not "CA$".
export function currencySymbol(code = "CAD") {
  try {
    const part = new Intl.NumberFormat("en-US", { style: "currency", currency: code, currencyDisplay: "narrowSymbol" })
      .formatToParts(0)
      .find((p) => p.type === "currency");
    return part ? part.value : "$";
  } catch {
    return "$";
  }
}

// Whole units by default (compact for chart labels); pass decimals:2 for a
// precise total. currency is the profile's code (see currencyCode).
export function formatCurrency(amount, { decimals = 0, currency = "CAD" } = {}) {
  const n = Number(amount) || 0;
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      currencyDisplay: "narrowSymbol",
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    }).format(n);
  } catch {
    return `$${n.toFixed(decimals)}`;
  }
}

// "I'm invoicing" receipts are money coming IN. Every spending number in the
// app (totals, charts, category shares) is about money going out, so those
// rows are skipped there. They still show in the receipt lists.
export function isIncome(row) {
  return row?.type === "Income";
}

export function spendingRows(rows) {
  return (rows || []).filter((r) => !isIncome(r));
}

export const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

// fiscalYearStart is the profile's "1".."12"; anything else means January.
export function fiscalStartMonth(profile) {
  const n = parseInt(profile?.fiscalYearStart, 10);
  return n >= 1 && n <= 12 ? n : 1;
}

// The 12 months (first-of-month Dates) of the fiscal year `offset` years
// before the one containing `now`, for a year starting in `startMonth`
// (1-12). Label is "2026" for a calendar year, "Apr 2026 – Mar 2027"
// otherwise; currentIndex is where `now` falls in the year (-1 if outside).
export function fiscalYear(startMonth, offset = 0, now = new Date()) {
  const start0 = (startMonth || 1) - 1;
  const firstYear =
    (now.getMonth() >= start0 ? now.getFullYear() : now.getFullYear() - 1) - offset;
  const months = Array.from({ length: 12 }, (_, i) => new Date(firstYear, start0 + i, 1));
  const last = months[11];
  const label =
    start0 === 0
      ? String(firstYear)
      : `${months[0].toLocaleString("en-US", { month: "short" })} ${firstYear} – ${last.toLocaleString("en-US", { month: "short" })} ${last.getFullYear()}`;
  const currentIndex = months.findIndex(
    (d) => d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth()
  );
  return {
    months,
    label,
    // One-letter month labels for a 12-bar chart, in fiscal order.
    letters: months.map((d) => MONTH_NAMES[d.getMonth()][0]),
    currentIndex,
  };
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
// `now` picks which week to show; `today` is the real date, so browsing a past
// week highlights nothing instead of always highlighting its Monday.
export function weeklyTotals(rows, now = new Date(), today = new Date()) {
  const { start: curStart, end: curEnd } = weekRange(now);
  const prevStart = new Date(curStart);
  prevStart.setDate(curStart.getDate() - 7);
  const prevEnd = new Date(curEnd);
  prevEnd.setDate(curEnd.getDate() - 7);

  const todayKey = new Date(today.getFullYear(), today.getMonth(), today.getDate()).toDateString();

  const days = DAY_LABELS.map((label, i) => {
    const d = new Date(curStart);
    d.setDate(curStart.getDate() + i);
    return { label, key: d.toDateString(), amount: 0, isToday: d.toDateString() === todayKey };
  });

  let currentTotal = 0;
  let previousTotal = 0;

  for (const r of spendingRows(rows)) {
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
    // This week's Mon/Sun bounds, so callers can render an actual date range
    // (e.g. "Jul 6 – 12") instead of the literal words "This week".
    weekStart: curStart,
    weekEnd: curEnd,
  };
}

// Current-month spend grouped by category, sorted highest first, with each
// category's % share of the month's total.
export function categoryTotals(rows, now = new Date()) {
  const year = now.getFullYear();
  const month = now.getMonth();
  const totals = new Map();
  let total = 0;

  for (const r of spendingRows(rows)) {
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

// Day-by-day activity for the period Home is showing (a week, a month or a
// fiscal year): one entry per day from start to end, with the money out and
// money in that day, plus a 0-4 shade for each side. Shades rank the day
// against that side's other days in the same period, so even a single week
// uses the full range, like GitHub's grades.
export function dailyActivity(rows, start, end) {
  const from = new Date(start.getFullYear(), start.getMonth(), start.getDate());
  const to = new Date(end.getFullYear(), end.getMonth(), end.getDate());
  const key = (d) => `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;

  const byDay = new Map();
  for (const r of rows || []) {
    const d = parseRowDate(r.date);
    if (!d || d < from || d > to) continue;
    const k = key(d);
    const e = byDay.get(k) || { out: 0, in: 0 };
    if (isIncome(r)) e.in += parseAmount(r.total);
    else e.out += parseAmount(r.total);
    byDay.set(k, e);
  }

  // A day's shade is its rank among that side's non-zero days: the biggest
  // day is always the darkest, the smallest of four or more the lightest.
  const ranker = (vals) => {
    const v = vals.filter((x) => x > 0).sort((a, b) => a - b);
    return (amount) => {
      if (amount <= 0 || !v.length) return 0;
      let atOrBelow = 0;
      while (atOrBelow < v.length && v[atOrBelow] <= amount) atOrBelow++;
      return Math.max(1, Math.ceil((4 * atOrBelow) / v.length));
    };
  };
  const all = [...byDay.values()];
  const outLevel = ranker(all.map((e) => e.out));
  const inLevel = ranker(all.map((e) => e.in));

  const days = [];
  const totals = { out: 0, in: 0 };
  for (let d = new Date(from); d <= to; d.setDate(d.getDate() + 1)) {
    const e = byDay.get(key(d)) || { out: 0, in: 0 };
    totals.out += e.out;
    totals.in += e.in;
    days.push({ date: new Date(d), ...e, outLevel: outLevel(e.out), inLevel: inLevel(e.in) });
  }
  return { days, totals };
}

// The date span Home shows for a tab and its ‹ › offset (0 = current).
// Week = Monday-Sunday, Month = calendar month, Year = fiscal year.
export function periodBounds(range, offset, fiscalStart = 1, now = new Date()) {
  if (range === "Week") {
    const start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - 7 * offset);
    const end = new Date(start);
    end.setDate(start.getDate() + 6);
    return { start, end };
  }
  if (range === "Month") {
    const start = new Date(now.getFullYear(), now.getMonth() - offset, 1);
    return { start, end: new Date(start.getFullYear(), start.getMonth() + 1, 0) };
  }
  const fy = fiscalYear(fiscalStart, offset, now);
  const last = fy.months[11];
  return { start: fy.months[0], end: new Date(last.getFullYear(), last.getMonth() + 1, 0) };
}

// First-of-month dates covering start..end (what useMonthRows caches by).
export function monthsBetween(start, end) {
  const out = [];
  for (let d = new Date(start.getFullYear(), start.getMonth(), 1); d <= end; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
    out.push(d);
  }
  return out;
}
