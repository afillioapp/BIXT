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
// Values are the theme's chart tokens (styles/tailwind.css --chart-1..5,
// owner-supplied light AND dark variants), assigned to the official
// 12-category list in order and cycled — so pills, hero, donut, and top
// lists all draw from the same 5-color system in both themes. Same alias
// rule as the icons.
const CATEGORY_ACCENT_MAP = {
  "Dining & Meals": "var(--chart-1)",
  "Coffee & Drinks": "var(--chart-2)",
  Travel: "var(--chart-3)",
  "Ground Transport": "var(--chart-4)",
  Fuel: "var(--chart-5)",
  Accommodation: "var(--chart-1)",
  "Office & Supplies": "var(--chart-2)",
  "Software & Tech": "var(--chart-3)",
  Marketing: "var(--chart-4)",
  "Professional Services": "var(--chart-5)",
  "Meetings & Events": "var(--chart-1)",
  Other: "var(--chart-2)",
  // Legacy aliases (pre-v1 rows) -> successor category's color
  "Meals & Entertainment": "var(--chart-1)",
  "Office Supplies": "var(--chart-2)",
  "Software & Subscriptions": "var(--chart-3)",
  "Marketing & Advertising": "var(--chart-4)",
  Equipment: "var(--chart-2)",
  "Fuel & Vehicle": "var(--chart-5)",
};

export function accentForCategory(category) {
  return CATEGORY_ACCENT_MAP[category] || CATEGORY_ACCENT_MAP.Other;
}

export default function CategoryIcon({ category, className }) {
  const Icon = iconForCategory(category);
  return <Icon className={className} aria-hidden="true" />;
}
