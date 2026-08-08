import {
  Utensils,
  Coffee,
  Plane,
  CarFront,
  Fuel,
  BedDouble,
  Package,
  Laptop,
  Megaphone,
  Briefcase,
  Ticket,
  ReceiptText,
} from "lucide-react";

// Single shared category -> icon mapping (owner request: replace the
// tinted first-letter squares on History and Home's Recent Expenses rows
// with the category's icon, on the same tinted square, so both lists agree).
// The v1 categories are pages/api/extract.js's official 12-category list;
// the aliases below are pre-v1 names already written into older receipts'
// sheets and must keep resolving to their successor's icon forever, or old
// receipts lose their icon.
const CATEGORY_ICON_MAP = {
  "Dining & Meals": Utensils,
  "Coffee & Drinks": Coffee,
  Travel: Plane,
  "Ground Transport": CarFront,
  Fuel: Fuel,
  Accommodation: BedDouble,
  "Office & Supplies": Package,
  "Software & Tech": Laptop,
  Marketing: Megaphone,
  "Professional Services": Briefcase,
  "Meetings & Events": Ticket,
  Other: ReceiptText,
  // Legacy aliases (pre-v1 rows) -> successor category's icon
  "Meals & Entertainment": Utensils, // -> Dining & Meals
  "Office Supplies": Package, // -> Office & Supplies
  "Software & Subscriptions": Laptop, // -> Software & Tech
  "Marketing & Advertising": Megaphone, // -> Marketing
  Equipment: Package, // -> Office & Supplies
  "Fuel & Vehicle": Fuel, // -> Fuel
};

export function iconForCategory(category) {
  return CATEGORY_ICON_MAP[category] || CATEGORY_ICON_MAP.Other;
}

// One signature color per category (owner request): shown on the hero
// total when that category is filtered, and on the active filter pill.
// Values are the theme's category tokens (styles/tailwind.css --cat-1..12),
// one per official category in OFFICIAL_CATEGORIES order, each with a light
// AND a dark value. Same alias rule as the icons — a legacy name resolves to
// its successor's color, so old receipts keep their identity.
//
// These tokens still hold the pre-redesign five cycled values, which is why
// several categories below share a color; WP2 re-values --cat-1..12 to twelve
// distinct hues without touching this map.
const CATEGORY_ACCENT_MAP = {
  "Dining & Meals": "var(--cat-1)",
  "Coffee & Drinks": "var(--cat-2)",
  Travel: "var(--cat-3)",
  "Ground Transport": "var(--cat-4)",
  Fuel: "var(--cat-5)",
  Accommodation: "var(--cat-6)",
  "Office & Supplies": "var(--cat-7)",
  "Software & Tech": "var(--cat-8)",
  Marketing: "var(--cat-9)",
  "Professional Services": "var(--cat-10)",
  "Meetings & Events": "var(--cat-11)",
  Other: "var(--cat-12)",
  // Legacy aliases (pre-v1 rows) -> successor category's color
  "Meals & Entertainment": "var(--cat-1)",
  "Office Supplies": "var(--cat-7)",
  "Software & Subscriptions": "var(--cat-8)",
  "Marketing & Advertising": "var(--cat-9)",
  Equipment: "var(--cat-7)",
  "Fuel & Vehicle": "var(--cat-5)",
};

export function accentForCategory(category) {
  return CATEGORY_ACCENT_MAP[category] || CATEGORY_ACCENT_MAP.Other;
}

// The official v1 12-category list, kept identical to pages/api/extract.js's
// CATEGORIES (that file is untouched/server-only, so the edit-row category
// <select> imports this copy instead — same exact names, since they're
// written into users' sheets as a stable schema).
export const OFFICIAL_CATEGORIES = [
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
  "Other",
];

export default function CategoryIcon({ category, className }) {
  const Icon = iconForCategory(category);
  return <Icon className={className} aria-hidden="true" />;
}
