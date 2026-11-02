// The categories are the CRA's GIFI items (owner request 2026-11-02): the names
// a receipt is filed under are the official ones, picked from RC4088 Appendix A,
// and the code goes with them to the accountant's annual report. This is the
// short list a small business actually uses; "Other expenses" catches the rest,
// and a business's own category can point at any code on this list.
//
// These names are written into users' expense sheets, so treat them as a stable
// schema: add new ones if needed, don't rename them.
export const GIFI_CATEGORIES = [
  { name: "Meals and entertainment", code: "8523" },
  { name: "Food and catering", code: "9135" },
  { name: "Office stationery and supplies", code: "8811" },
  { name: "Vehicle expenses", code: "9281" },
  { name: "Motor vehicle rentals", code: "8915" },
  { name: "Travel expenses", code: "9200" },
  { name: "Meetings and conventions", code: "9201" },
  { name: "Purchases/cost of materials", code: "8320" },
  { name: "Supplies", code: "9130" },
  { name: "Small tools", code: "9131" },
  { name: "Computer-related expenses", code: "9150" },
  { name: "Internet", code: "9152" },
  { name: "Telephone and telecommunications", code: "9225" },
  { name: "Utilities", code: "9220" },
  { name: "Real estate rental", code: "8911" },
  { name: "Repairs and maintenance", code: "8960" },
  { name: "Advertising", code: "8521" },
  { name: "Professional fees", code: "8860" },
  { name: "Legal fees", code: "8861" },
  { name: "Accounting fees", code: "8862" },
  { name: "Sub-contracts", code: "9110" },
  { name: "Salaries and wages", code: "9060" },
  { name: "Insurance", code: "8690" },
  { name: "Business taxes, licences, and memberships", code: "8760" },
  { name: "Bank charges", code: "8715" },
  { name: "Credit card charges", code: "8716" },
  { name: "Delivery, freight and express", code: "9275" },
  { name: "Other expenses", code: "9270" },
];

export const OTHER_CATEGORY = "Other expenses";
const OTHER_CODE = "9270";
// Income has a single line in the annual report for now.
export const REVENUE_CODE = "8000";
const REVENUE_NAME = "Trade sales of goods and services";

// Money moving, not money spent: still saved to the sheet for the accountant,
// but kept out of every spending total and chart (owner decision 2026-10-30).
// Not expenses, so they have no GIFI code.
export const NOT_SPENDING = new Set(["Bank Transfers & Payments", "Cash Withdrawal"]);

const NAME_TO_CODE = new Map(GIFI_CATEGORIES.map((c) => [c.name, c.code]));
const CODE_TO_GIFI_NAME = new Map([...GIFI_CATEGORIES.map((c) => [c.code, c.name]), [REVENUE_CODE, REVENUE_NAME]]);

export function gifiName(code) {
  return CODE_TO_GIFI_NAME.get(String(code)) || CODE_TO_GIFI_NAME.get(OTHER_CODE);
}

// Names already written into older receipts' sheets. Those rows are never
// rewritten in bulk; they read back under the name they map to here (and an
// edit saves the new name). Never delete an entry, and never let a new category
// take one of these names (categoryNameProblem).
const LEGACY_CATEGORIES = {
  "Dining & Meals": "Meals and entertainment",
  "Coffee & Drinks": "Meals and entertainment",
  Travel: "Travel expenses",
  "Ground Transport": "Travel expenses",
  // Not 9224 "Fuel costs": the CRA defines that as fuel for heating and cooking.
  Fuel: "Vehicle expenses",
  Accommodation: "Travel expenses",
  "Office & Supplies": "Office stationery and supplies",
  "Software & Tech": "Computer-related expenses",
  Marketing: "Advertising",
  "Professional Services": "Professional fees",
  "Meetings & Events": "Meetings and conventions",
  Groceries: "Food and catering",
  Other: OTHER_CATEGORY,
  // Pre-v1 names
  "Meals & Entertainment": "Meals and entertainment",
  "Office Supplies": "Office stationery and supplies",
  "Software & Subscriptions": "Computer-related expenses",
  "Marketing & Advertising": "Advertising",
  Equipment: "Office stationery and supplies",
  "Fuel & Vehicle": "Vehicle expenses",
};

// Most specific first: an ATM slip printed by TD is a cash withdrawal, not a
// transfer.
const RULES = [
  ["Cash Withdrawal", /\batm\b|\bwithdrawal\b|\bcash (?:back|advance)\b|\babm\b/i],
  [
    "Bank Transfers & Payments",
    /\b(?:td|td canada trust|td bank|cibc|rbc|royal bank|bmo|bank of montreal|scotia(?:bank)?|tangerine|desjardins|national bank|hsbc|simplii|eq bank|atb|laurentian|amex|american express)\b|\bbank\b|e-?transfer|\binterac\b|\btransfer\b|\bbill payment\b|\bpayment received\b|\bdeposit\b/i,
  ],
  ["Real estate rental", /\brent\b|\blease\b/i],
  ["Telephone and telecommunications", /\brogers\b|\bbell\b|\btelus\b|\bfido\b|\bkoodo\b|\bvirgin plus\b|\bfreedom mobile\b|\bchatr\b/i],
  ["Internet", /\binternet\b/i],
  ["Utilities", /\bhydro\b|\benbridge\b|\butilit(?:y|ies)\b|\bwater bill\b/i],
  [
    "Food and catering",
    /\bgrocer(?:y|ies)\b|\bsupermarket\b|\bpars food\b|\bwhole foods\b|\bloblaws?\b|\bno frills\b|\bfood basics\b|\bsobeys\b|\bfreshco\b|\bfarm boy\b|\blongo'?s\b|\bfortinos\b|\bzehrs\b|\bvalu-?mart\b|\bt ?& ?t\b|\bgalleria\b|\bsuperstore\b|\bfood market\b|\bmetro (?:inc|plus|store)\b|\biga\b|\bsave-?on-?foods\b/i,
  ],
];

// The category a vendor clearly belongs to, or null. Used as a safety net when
// the reader answers "Other expenses", and by Settings' one-tap re-sort.
export function suggestCategory(vendor) {
  const text = String(vendor || "");
  for (const [category, re] of RULES) {
    if (re.test(text)) return category;
  }
  return null;
}

// What an older sheet's category is called now. "Rent & Utilities" split in
// three when GIFI arrived, so it takes the vendor into account.
export function canonicalCategory(category, vendor) {
  const name = String(category || "").trim() || OTHER_CATEGORY;
  if (name === "Rent & Utilities") {
    const byVendor = suggestCategory(vendor);
    return ["Real estate rental", "Telephone and telecommunications", "Internet"].includes(byVendor) ? byVendor : "Utilities";
  }
  return LEGACY_CATEGORIES[name] || name;
}

// ── The owner's own categories (owner request 2026-11-02) ──
//
// A business can add its own categories, each with an icon from the bank in
// components/CategoryIcon.js, and hide built-ins it doesn't use. Stored as
// Drive properties on the company folder, so they follow the owner to every
// device: one property per category ("cat0".."cat19" = "IconName|Name|GIFI"; the
// code is missing on ones saved before GIFI, which report as Other expenses), and
// "hiddenCats" holding the hidden built-ins as short codes. Drive allows 124
// bytes per property and 30 per file, which is why these limits exist.

export const MAX_CUSTOM_CATEGORIES = 20;
export const MAX_CATEGORY_NAME = 30;
const MAX_NAME_BYTES = 95; // leaves room for the key, icon name and code in 124

export const CUSTOM_CATEGORY_KEYS = Array.from({ length: MAX_CUSTOM_CATEGORIES }, (_, i) => `cat${i}`);
export const HIDDEN_CATEGORIES_KEY = "hiddenCats";

// Other expenses stays last: it's the fallback.
export const BUILTIN_CATEGORIES = [
  ...GIFI_CATEGORIES.filter((c) => c.name !== OTHER_CATEGORY).map((c) => c.name),
  ...NOT_SPENDING,
  OTHER_CATEGORY,
];

// Frozen short codes for hiddenCats: fits the byte limit, and survives the list
// growing or being reordered. Other expenses can't be hidden. The two-letter
// codes of the pre-GIFI names are retired; don't reuse dm cd tr gt fu ac os st mk
// ps me gr ru.
const BUILTIN_CODES = {
  "Meals and entertainment": "01",
  "Food and catering": "02",
  "Office stationery and supplies": "03",
  "Vehicle expenses": "04",
  "Motor vehicle rentals": "05",
  "Travel expenses": "06",
  "Meetings and conventions": "07",
  "Purchases/cost of materials": "08",
  Supplies: "09",
  "Small tools": "10",
  "Computer-related expenses": "11",
  Internet: "12",
  "Telephone and telecommunications": "13",
  Utilities: "14",
  "Real estate rental": "15",
  "Repairs and maintenance": "16",
  Advertising: "17",
  "Professional fees": "18",
  "Legal fees": "19",
  "Accounting fees": "20",
  "Sub-contracts": "21",
  "Salaries and wages": "22",
  Insurance: "23",
  "Business taxes, licences, and memberships": "24",
  "Bank charges": "25",
  "Credit card charges": "26",
  "Delivery, freight and express": "27",
  "Bank Transfers & Payments": "bt",
  "Cash Withdrawal": "cw",
};
const CODE_TO_NAME = Object.fromEntries(Object.entries(BUILTIN_CODES).map(([n, c]) => [c, n]));

// [{ key: "cat3", name: "Job Materials", icon: "Hammer", gifi: "8320" }, …]
export function customCategories(profile) {
  const out = [];
  for (const key of CUSTOM_CATEGORY_KEYS) {
    const raw = profile?.[key];
    if (!raw) continue;
    const bar = raw.indexOf("|");
    if (bar === -1) continue;
    const rest = raw.slice(bar + 1);
    const coded = /^(.*)\|(\d{4})$/.exec(rest);
    out.push({ key, icon: raw.slice(0, bar), name: coded ? coded[1] : rest, gifi: coded ? coded[2] : "" });
  }
  return out;
}

export function encodeCustomCategory(name, icon, gifi = OTHER_CODE) {
  return `${icon}|${name}|${gifi}`;
}

// The GIFI code a receipt in this category reports under, or "" for money
// moving. A business's own category uses the code it chose.
export function gifiCodeFor(category, profile) {
  if (NOT_SPENDING.has(category)) return "";
  const own = customCategories(profile).find((c) => c.name === category);
  return own?.gifi || NAME_TO_CODE.get(category) || OTHER_CODE;
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
  const names = new Set([
    ...customCategories(profile).map((c) => c.name),
    ...BUILTIN_CATEGORIES.filter((c) => !hidden.has(c)),
  ]);
  if (keep) names.add(keep);
  return [...names];
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
  const taken = [...BUILTIN_CATEGORIES, ...Object.keys(LEGACY_CATEGORIES), "Rent & Utilities", ...customCategories(profile).map((c) => c.name)];
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
