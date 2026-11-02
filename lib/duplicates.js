// Is this receipt already saved? (owner request 2026-11-02)
//
// Two photos of one receipt are never byte-identical, so receipts are compared
// by what they say: same date, same total, and a vendor that reads alike
// ("Shell Canada" and "SHELL #1234"). Two real purchases can match this too, so
// the app warns rather than refuses; see pages/capture.js.

// "$1,250.00", "€12", "-5.00", "(5.00)" -> whole cents, or null if not a number.
export function moneyToCents(v) {
  const text = String(v ?? "").trim();
  const negative = /^\(.*\)$/.test(text) || /^-/.test(text) || /^[^\d]*-/.test(text);
  const n = parseFloat(text.replace(/[^\d.]/g, ""));
  if (!Number.isFinite(n)) return null;
  const cents = Math.round(n * 100);
  return negative ? -cents : cents;
}

// YYYY-MM-DD, whatever date text a sheet hands back, or "" if unreadable.
export function normalizeDate(v) {
  const text = String(v ?? "").trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  const d = new Date(text);
  if (!text || isNaN(d.getTime())) return "";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

// Words that say nothing about which business this is.
const FILLER = new Set(["the", "inc", "ltd", "llc", "corp", "co", "company", "store", "canada", "limited"]);

function vendorWords(v) {
  return String(v ?? "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .split(" ")
    .filter((w) => w && !FILLER.has(w) && !/^\d+$/.test(w));
}

export function sameVendor(a, b) {
  const wa = vendorWords(a);
  const wb = vendorWords(b);
  if (!wa.length || !wb.length) return false;
  // "Wal-Mart" and "Walmart" are one word apart; otherwise every word of the
  // shorter name must be in the longer ("Staples" and "Staples Business Depot",
  // but not "Home Depot" and "Home Hardware", or "Bell" and "Campbell").
  if (wa.join("") === wb.join("")) return true;
  const [short, long] = wa.length <= wb.length ? [wa, wb] : [wb, wa];
  return short.every((w) => long.includes(w));
}

// a and b are anything with { date, total, place, type }: a capture form or a
// sheet row. A blank type (not answered yet) matches either answer, so money
// in and money out for the same amount never count as the same receipt.
export function sameReceipt(a, b) {
  if (a.type && b.type && a.type !== b.type) return false;
  const date = normalizeDate(a.date);
  if (!date || date !== normalizeDate(b.date)) return false;
  const cents = moneyToCents(a.total);
  if (!cents || cents !== moneyToCents(b.total)) return false;
  return sameVendor(a.place, b.place);
}
