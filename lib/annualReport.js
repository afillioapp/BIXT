import { gifiCodeFor, gifiName, NOT_SPENDING, REVENUE_CODE } from "./categories.js";
import { moneyToCents, normalizeDate } from "./duplicates.js";

// The annual report (owner request 2026-11-02): one Google Sheet per fiscal
// year, with an Overview tab first and a tab for each month. It's built from
// the monthly Expenses sheets, which stay the source of truth, so everything in
// it is plain values and a rebuild overwrites hand edits. This file is the pure
// part: what goes in the cells. lib/google.js writes them.

export const OVERVIEW_TAB = "Overview";

export const REPORT_HEADER = [
  "Date",
  "Vendor",
  "GIFI",
  "Category",
  "Type",
  "Total",
  "HST",
  "Net amount",
  "Receipt Link",
  "Note for accountant",
];
const COL = { gifi: 2, category: 3, type: 4, total: 5, hst: 6, net: 7 };

export const OVERVIEW_HEADER = ["GIFI", "Category", "Receipts", "Net amount", "HST", "Total", "% of costs"];

export function reportFileName(fy) {
  return `${fy.label} Annual Report`;
}

// "Apr 2026"
export function tabTitle(month) {
  return `${month.toLocaleString("en-US", { month: "short" })} ${month.getFullYear()}`;
}

// A date cell as Sheets counts it, so the accountant can sort and filter by it.
function dateSerial(ymd) {
  const [y, m, d] = ymd.split("-").map(Number);
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
}

const fromCents = (c) => c / 100;

// Which part of the report a receipt belongs to, and under which code. Money
// moving has no GIFI code; income has one line for now (8000).
export function classifyRow(row, profile) {
  if (NOT_SPENDING.has(row.category)) return { section: "moved", code: "" };
  if (row.type === "Income") return { section: "revenue", code: REVENUE_CODE };
  return { section: "expense", code: gifiCodeFor(row.category, profile) };
}

// One month's receipts (from listExpenseRows) as the cells of its tab, by date.
export function monthTabRows(rows, profile) {
  return [...rows]
    .map((row) => ({ row, date: normalizeDate(row.date) }))
    .sort((a, b) => a.date.localeCompare(b.date) || a.row.rowIndex - b.row.rowIndex)
    .map(({ row, date }) => {
      const total = moneyToCents(row.total);
      const hst = moneyToCents(row.hst) ?? 0;
      return [
        date ? dateSerial(date) : row.date || "",
        row.place || "",
        Number(classifyRow(row, profile).code) || "",
        row.category || "",
        row.type || "Expense",
        total === null ? "" : fromCents(total),
        fromCents(hst),
        total === null ? "" : fromCents(total - hst),
        row.receiptLink || "",
        row.note || "",
      ];
    });
}

function addTo(groups, key, label, code, cells) {
  const g = groups.get(key) || { code, label, count: 0, net: 0, hst: 0, total: 0 };
  g.count += 1;
  g.net += moneyToCents(cells[COL.net]) ?? 0;
  g.hst += moneyToCents(cells[COL.hst]) ?? 0;
  g.total += moneyToCents(cells[COL.total]) ?? 0;
  groups.set(key, g);
}

function sectionRows(groups, costBase) {
  return [...groups.values()]
    .sort((a, b) => String(a.code).localeCompare(String(b.code)) || a.label.localeCompare(b.label))
    .map((g) => [
      g.code ? Number(g.code) : "",
      g.label,
      g.count,
      fromCents(g.net),
      fromCents(g.hst),
      fromCents(g.total),
      costBase ? g.net / costBase : "",
    ]);
}

function sum(groups, key) {
  let n = 0;
  for (const g of groups.values()) n += g[key];
  return n;
}

// The first tab: cost per GIFI code for the year. tabRows is every month tab's
// data rows put together (as read back from the sheet, so it follows the cells
// exactly). Returns the cells, and which rows are headings or amounts so
// lib/google.js can format them.
export function buildOverview(tabRows, { company, label, currency, today }) {
  const expense = new Map();
  const revenue = new Map();
  const moved = new Map();
  for (const cells of tabRows) {
    const code = String(cells[COL.gifi] ?? "").trim();
    const category = String(cells[COL.category] ?? "").trim();
    if (!code) addTo(moved, category, category, "", cells);
    else if (cells[COL.type] === "Income") addTo(revenue, code, gifiName(code), code, cells);
    else addTo(expense, code, gifiName(code), code, cells);
  }

  const totalLine = (name, groups, share) => [
    "",
    name,
    sum(groups, "count"),
    fromCents(sum(groups, "net")),
    fromCents(sum(groups, "hst")),
    fromCents(sum(groups, "total")),
    share,
  ];

  const values = [
    [`${company || "Your business"}: annual report`],
    [`${label} · Amounts in ${currency} · Updated ${today}`],
    ["Built by BX from your monthly sheets. To correct a receipt, change it in the app or its monthly sheet."],
    [],
  ];
  const headingRows = [0];
  const amountRows = [];
  const push = (rows) => {
    for (const r of rows) {
      amountRows.push(values.length);
      values.push(r);
    }
  };
  const heading = (cells) => {
    headingRows.push(values.length);
    values.push(cells);
  };
  const totalRow = (cells) => {
    headingRows.push(values.length);
    amountRows.push(values.length);
    values.push(cells);
  };

  const costBase = sum(expense, "net");
  heading([...OVERVIEW_HEADER]);
  if (expense.size) {
    push(sectionRows(expense, costBase));
    totalRow(totalLine("Total expenses", expense, costBase ? 1 : ""));
  } else {
    values.push(["", "No expenses yet"]);
  }

  if (revenue.size) {
    values.push([]);
    heading(["Revenue"]);
    push(sectionRows(revenue, 0));
    totalRow(totalLine("Total revenue", revenue, ""));
  }

  if (moved.size) {
    values.push([]);
    heading(["Money moved, not spent (no GIFI code, left out of the totals above)"]);
    push(sectionRows(moved, 0));
  }

  return { values, headingRows, amountRows };
}
