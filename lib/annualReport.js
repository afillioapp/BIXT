import { gifiCodeFor, gifiName, NOT_SPENDING, REVENUE_CODE } from "./categories.js";
import { moneyToCents } from "./duplicates.js";

// The yearly file (owner request 2026-11-02): one Google Sheet per fiscal year,
// named after the company and the year the fiscal year starts in, with an
// Overview tab first and a tab for each month. The month tabs hold the receipts
// themselves. The Overview is plain values rebuilt from them. This file is the
// pure part; lib/google.js reads and writes the sheet.

export const OVERVIEW_TAB = "Overview";

export const OVERVIEW_HEADER = ["GIFI", "Category", "Receipts", "Net amount", "HST", "Total", "% of costs"];

// A receipt from January 2027 belongs to the year starting April 2026.
export function fiscalYearNumber(date, startMonth) {
  return date.getMonth() >= startMonth - 1 ? date.getFullYear() : date.getFullYear() - 1;
}

export function yearFileName(company, year) {
  return `${company || "Expenses"} ${year}`;
}

// "Oct". A file only holds twelve months, so the name alone is unique in it.
export function monthTab(month) {
  return month.toLocaleString("en-US", { month: "short" });
}

const fromCents = (c) => c / 100;

// Which part of the Overview a receipt belongs to, and under which code. Money
// moving has no GIFI code; income has one line for now (8000).
export function classifyRow(row, profile) {
  if (NOT_SPENDING.has(row.category)) return { section: "moved", code: "" };
  if (row.type === "Income") return { section: "revenue", code: REVENUE_CODE };
  return { section: "expense", code: gifiCodeFor(row.category, profile) };
}

function addTo(groups, key, label, code, row) {
  const g = groups.get(key) || { code, label, count: 0, net: 0, hst: 0, total: 0 };
  const total = moneyToCents(row.total) ?? 0;
  const hst = moneyToCents(row.hst) ?? 0;
  g.count += 1;
  g.net += total - hst;
  g.hst += hst;
  g.total += total;
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

// The first tab: cost per GIFI code for the year, from every month's rows (as
// listExpenseRows reads them). Returns the cells, and which rows are headings or
// amounts so lib/google.js can format them.
export function buildOverview(rows, profile, { label, currency, today }) {
  const expense = new Map();
  const revenue = new Map();
  const moved = new Map();
  for (const row of rows) {
    const { section, code } = classifyRow(row, profile);
    if (section === "moved") addTo(moved, row.category, row.category, "", row);
    else if (section === "revenue") addTo(revenue, code, gifiName(code), code, row);
    else addTo(expense, code, gifiName(code), code, row);
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
    [`${profile?.companyName || "Your business"}: overview`],
    [`${label} · Amounts in ${currency} · Updated ${today}`],
    ["Built by BX from the month tabs. It updates when a receipt changes in the app, or from Settings."],
    [],
  ];
  const headingRows = [0];
  const amountRows = [];
  const push = (cells) => {
    for (const r of cells) {
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
