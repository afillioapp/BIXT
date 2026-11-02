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

// ── The owner's own categories (owner request 2026-11-02) ──
//
// A business can add its own categories, each with an icon from the bank in
// components/CategoryIcon.js, and hide built-ins it doesn't use. Stored as
// Drive properties on the company folder, so they follow the owner to every
// device: one property per category ("cat0".."cat19" = "IconName|Name"), and
// "hiddenCats" holding the hidden built-ins as short codes. Drive allows 124
// bytes per property and 30 per file, which is why these limits exist.

export const MAX_CUSTOM_CATEGORIES = 20;
export const MAX_CATEGORY_NAME = 30;
const MAX_NAME_BYTES = 100; // leaves room for the key and icon name in 124

export const CUSTOM_CATEGORY_KEYS = Array.from({ length: MAX_CUSTOM_CATEGORIES }, (_, i) => `cat${i}`);
export const HIDDEN_CATEGORIES_KEY = "hiddenCats";

export const BUILTIN_CATEGORIES = [
  "Dining & Meals",
  "Coffee & Drinks",
  "Travel",
  "Ground Transport",
  "Fuel",
  "Accommodation",
  "Office & Supplies",
  "Software & Tech",
  "Marketing",
  "Professional Services",
  "Meetings & Events",
  "Groceries",
  "Rent & Utilities",
  "Bank Transfers & Payments",
  "Cash Withdrawal",
  "Other",
];

// Frozen short codes for hiddenCats: fits the byte limit, and survives the
// list growing or being reordered. Other can't be hidden (it's the fallback).
const BUILTIN_CODES = {
  "Dining & Meals": "dm",
  "Coffee & Drinks": "cd",
  Travel: "tr",
  "Ground Transport": "gt",
  Fuel: "fu",
  Accommodation: "ac",
  "Office & Supplies": "os",
  "Software & Tech": "st",
  Marketing: "mk",
  "Professional Services": "ps",
  "Meetings & Events": "me",
  Groceries: "gr",
  "Rent & Utilities": "ru",
  "Bank Transfers & Payments": "bt",
  "Cash Withdrawal": "cw",
};
const CODE_TO_NAME = Object.fromEntries(Object.entries(BUILTIN_CODES).map(([n, c]) => [c, n]));

// [{ key: "cat3", name: "Job Materials", icon: "Hammer" }, …]
export function customCategories(profile) {
  const out = [];
  for (const key of CUSTOM_CATEGORY_KEYS) {
    const raw = profile?.[key];
    if (!raw) continue;
    const bar = raw.indexOf("|");
    if (bar === -1) continue;
    out.push({ key, icon: raw.slice(0, bar), name: raw.slice(bar + 1) });
  }
  return out;
}

export function encodeCustomCategory(name, icon) {
  return `${icon}|${name}`;
}

export function freeCategoryKey(profile) {
  return CUSTOM_CATEGORY_KEYS.find((k) => !profile?.[k]) || null;
}

export function hiddenCategories(profile) {
  return String(profile?.[HIDDEN_CATEGORIES_KEY] || "")
    .split(",")
    .map((c) => CODE_TO_NAME[c])
    .filter(Boolean);
}

export function encodeHiddenCategories(names) {
  return names.map((n) => BUILTIN_CODES[n]).filter(Boolean).join(",");
}

// What the category picker offers: the owner's own first, then the built-ins
// they haven't hidden, with Other last. `keep` (a receipt's current category)
// stays selectable even if it has since been hidden or removed.
export function pickerCategories(profile, keep) {
  const hidden = new Set(hiddenCategories(profile));
  const names = [
    ...customCategories(profile).map((c) => c.name),
    ...BUILTIN_CATEGORIES.filter((c) => !hidden.has(c)),
  ];
  if (keep && !names.includes(keep)) names.push(keep);
  return names;
}

// An error sentence, or "" if the name is fine. `ignore` is the category's
// current name when renaming.
export function categoryNameProblem(name, profile, ignore = "") {
  const clean = String(name || "").trim();
  if (!clean) return "Give your category a name.";
  if (clean.length > MAX_CATEGORY_NAME) return `Keep the name under ${MAX_CATEGORY_NAME} characters.`;
  if (new TextEncoder().encode(clean).length > MAX_NAME_BYTES) return "That name is too long.";
  // These characters would make a spreadsheet treat the name as a formula.
  if (/^[=+@-]/.test(clean)) return "The name can't start with = + @ or -.";
  const lower = clean.toLowerCase();
  if (lower === String(ignore).toLowerCase()) return "";
  const taken = [...BUILTIN_CATEGORIES, ...customCategories(profile).map((c) => c.name)];
  if (taken.some((c) => c.toLowerCase() === lower)) return "You already have a category with that name.";
  return "";
}

// Lets a receipt row anywhere in the app find its custom icon without passing
// the profile through every list. Refreshed whenever the profile loads.
let customIcons = new Map();

export function registerCustomCategories(profile) {
  customIcons = new Map(customCategories(profile).map((c) => [c.name, c.icon]));
}

export function customIconName(category) {
  return customIcons.get(category) || null;
}
