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
// Medium-bright hues chosen to stay readable on brand-navy AND to carry
// dark text when used as a pill background. Same alias rule as the icons.
const CATEGORY_ACCENT_MAP = {
  "Dining & Meals": "#F59E0B",
  "Coffee & Drinks": "#FB923C",
  Travel: "#38BDF8",
  "Ground Transport": "#818CF8",
  Fuel: "#FB7185",
  Accommodation: "#A78BFA",
  "Office & Supplies": "#34D399",
  "Software & Tech": "#60A5FA",
  Marketing: "#F472B6",
  "Professional Services": "#FACC15",
  "Meetings & Events": "#2DD4BF",
  Other: "#9CA3AF",
  // Legacy aliases (pre-v1 rows) -> successor category's color
  "Meals & Entertainment": "#F59E0B",
  "Office Supplies": "#34D399",
  "Software & Subscriptions": "#60A5FA",
  "Marketing & Advertising": "#F472B6",
  Equipment: "#34D399",
  "Fuel & Vehicle": "#FB7185",
};

export function accentForCategory(category) {
  return CATEGORY_ACCENT_MAP[category] || CATEGORY_ACCENT_MAP.Other;
}

export default function CategoryIcon({ category, className }) {
  const Icon = iconForCategory(category);
  return <Icon className={className} aria-hidden="true" />;
}
