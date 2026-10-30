// Categories added 2026-10-30 (owner request): receipts that fit none of the
// original 12 piled up in "Other" — mostly bank slips — and, because Top
// Categories measures money, a few large transfers made "Other" 86% of
// spending. These names join the stable list (pages/api/extract.js
// CATEGORIES, components/CategoryIcon.js OFFICIAL_CATEGORIES and
// ocr-service/bx_ocr/categories.py must all carry them, in the same order).

export const NEW_CATEGORIES = ["Groceries", "Rent & Utilities", "Bank Transfers & Payments", "Cash Withdrawal"];

// Money moving, not money spent: still saved to the sheet for the accountant,
// but kept out of every spending total and chart (owner decision).
export const NOT_SPENDING = new Set(["Bank Transfers & Payments", "Cash Withdrawal"]);

// Most specific first: an ATM slip printed by TD is a cash withdrawal, not a
// transfer.
const RULES = [
  ["Cash Withdrawal", /\batm\b|\bwithdrawal\b|\bcash (?:back|advance)\b|\babm\b/i],
  [
    "Bank Transfers & Payments",
    /\b(?:td|td canada trust|td bank|cibc|rbc|royal bank|bmo|bank of montreal|scotia(?:bank)?|tangerine|desjardins|national bank|hsbc|simplii|eq bank|atb|laurentian|amex|american express)\b|\bbank\b|e-?transfer|\binterac\b|\btransfer\b|\bbill payment\b|\bpayment received\b|\bdeposit\b/i,
  ],
  [
    "Rent & Utilities",
    /\brent\b|\blease\b|\bhydro\b|\benbridge\b|\butilit(?:y|ies)\b|\brogers\b|\bbell\b|\btelus\b|\bfido\b|\bkoodo\b|\bvirgin plus\b|\bfreedom mobile\b|\bchatr\b|\binternet\b|\bwater bill\b|\bproperty tax\b/i,
  ],
  [
    "Groceries",
    /\bgrocer(?:y|ies)\b|\bsupermarket\b|\bpars food\b|\bwhole foods\b|\bloblaws?\b|\bno frills\b|\bfood basics\b|\bsobeys\b|\bfreshco\b|\bfarm boy\b|\blongo'?s\b|\bfortinos\b|\bzehrs\b|\bvalu-?mart\b|\bt ?& ?t\b|\bgalleria\b|\bsuperstore\b|\bfood market\b|\bmetro (?:inc|plus|store)\b|\biga\b|\bsave-?on-?foods\b/i,
  ],
];

// The new category a vendor clearly belongs to, or null. Used as a safety net
// when the reader answers "Other", and by Settings' one-tap re-sort.
export function suggestCategory(vendor) {
  const text = String(vendor || "");
  for (const [category, re] of RULES) {
    if (re.test(text)) return category;
  }
  return null;
}
