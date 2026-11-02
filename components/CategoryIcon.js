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
  ShoppingBasket,
  Zap,
  ArrowLeftRight,
  Banknote,
  Pizza,
  Beer,
  Wine,
  Truck,
  Bike,
  TrainFront,
  Hammer,
  Wrench,
  Paintbrush,
  Ruler,
  HardHat,
  Scissors,
  Printer,
  Smartphone,
  FileText,
  Building2,
  Droplets,
  Wifi,
  Phone,
  KeyRound,
  Users,
  GraduationCap,
  HeartPulse,
  Stethoscope,
  PawPrint,
  Baby,
  Tag,
  Gift,
  Shirt,
  Camera,
  Music,
  Dumbbell,
  Leaf,
  Star,
  Globe,
  Sparkles,
  Calculator,
  CreditCard,
  Landmark,
  Paperclip,
  Scale,
  ShieldCheck,
} from "lucide-react";
import { BUILTIN_CATEGORIES, OTHER_CATEGORY, customIconName } from "../lib/categories";

// The bank of icons a business can choose from for its own categories (owner
// request 2026-11-02). All from the same line-icon set as the built-ins, so
// they share one visual identity. The object keys are saved to the owner's
// Drive, so never rename one; add new ones freely.
export const ICON_BANK = {
  Utensils,
  Coffee,
  Pizza,
  Beer,
  Wine,
  ShoppingBasket,
  CarFront,
  Truck,
  Bike,
  Plane,
  TrainFront,
  Fuel,
  Hammer,
  Wrench,
  Paintbrush,
  Ruler,
  HardHat,
  Scissors,
  Package,
  Printer,
  Laptop,
  Smartphone,
  Briefcase,
  FileText,
  Building2,
  Zap,
  Droplets,
  Wifi,
  Phone,
  KeyRound,
  Users,
  GraduationCap,
  HeartPulse,
  Stethoscope,
  PawPrint,
  Baby,
  Megaphone,
  Tag,
  Gift,
  Shirt,
  Camera,
  Music,
  Dumbbell,
  Leaf,
  Star,
  Globe,
  Ticket,
  Sparkles,
};

// Single shared category -> icon mapping (owner request: replace the
// tinted first-letter squares on History and Home's Recent Expenses rows
// with the category's icon, on the same tinted square, so both lists agree).
// The v1 categories are pages/api/extract.js's official 12-category list;
// the aliases below are pre-v1 names already written into older receipts'
// sheets and must keep resolving to their successor's icon forever, or old
// receipts lose their icon.
const CATEGORY_ICON_MAP = {
  // GIFI categories (lib/categories.js)
  "Meals and entertainment": Utensils,
  "Food and catering": ShoppingBasket,
  "Office stationery and supplies": Paperclip,
  "Vehicle expenses": Fuel,
  "Motor vehicle rentals": CarFront,
  "Travel expenses": Plane,
  "Meetings and conventions": Ticket,
  "Purchases/cost of materials": Package,
  Supplies: Package,
  "Small tools": Hammer,
  "Computer-related expenses": Laptop,
  Internet: Wifi,
  "Telephone and telecommunications": Phone,
  Utilities: Zap,
  "Real estate rental": Building2,
  "Repairs and maintenance": Wrench,
  Advertising: Megaphone,
  "Professional fees": Briefcase,
  "Legal fees": Scale,
  "Accounting fees": Calculator,
  "Sub-contracts": HardHat,
  "Salaries and wages": Users,
  Insurance: ShieldCheck,
  "Business taxes, licences, and memberships": Landmark,
  "Bank charges": ArrowLeftRight,
  "Credit card charges": CreditCard,
  "Delivery, freight and express": Truck,
  "Other expenses": ReceiptText,
  // Pre-GIFI names, kept so nothing loses its icon
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
  Groceries: ShoppingBasket,
  "Rent & Utilities": Zap,
  "Bank Transfers & Payments": ArrowLeftRight,
  "Cash Withdrawal": Banknote,
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
  return ICON_BANK[customIconName(category)] || CATEGORY_ICON_MAP[category] || CATEGORY_ICON_MAP[OTHER_CATEGORY];
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
  Groceries: "var(--chart-2)",
  "Rent & Utilities": "var(--chart-3)",
  "Bank Transfers & Payments": "var(--chart-4)",
  "Cash Withdrawal": "var(--chart-5)",
  Other: "var(--chart-2)",
  // Legacy aliases (pre-v1 rows) -> successor category's color
  "Meals & Entertainment": "var(--chart-1)",
  "Office Supplies": "var(--chart-2)",
  "Software & Subscriptions": "var(--chart-3)",
  "Marketing & Advertising": "var(--chart-4)",
  Equipment: "var(--chart-2)",
  "Fuel & Vehicle": "var(--chart-5)",
};

// The positional chart palette, cycled for however many categories a real
// month has. Lives here beside CATEGORY_ACCENT_MAP so the two colour rules
// stay in one file. pages/stats.js and components/HomeCarousel.js still keep
// their own identical private copies; worth collapsing into this one day.
const CATEGORY_PALETTE = ["var(--chart-1)", "var(--chart-2)", "var(--chart-3)", "var(--chart-4)", "var(--chart-5)"];

export function paletteColor(i) {
  return CATEGORY_PALETTE[i % CATEGORY_PALETTE.length];
}

// Unknown names are the owner's own categories: hashed, so each keeps one
// stable colour from the same palette.
export function accentForCategory(category) {
  if (CATEGORY_ACCENT_MAP[category]) return CATEGORY_ACCENT_MAP[category];
  let hash = 0;
  for (const ch of String(category || "")) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0;
  return CATEGORY_PALETTE[hash % CATEGORY_PALETTE.length];
}

// The built-in list, identical to pages/api/extract.js's CATEGORIES (those
// names are written into users' sheets as a stable schema). The owner's own
// categories come from lib/categories.js pickerCategories.
export const OFFICIAL_CATEGORIES = BUILTIN_CATEGORIES;

// Same stable per-category tint approach both pages used inline before this
// component existed (design's bg-*-50/text-*-600 pairs, hashed per category
// so a category always renders the same swatch).
export const TINTS = [
  "bg-brand-teal-soft text-brand-teal",
  "bg-orange-50 text-orange-600 dark:bg-orange-400/15 dark:text-orange-300",
  "bg-indigo-50 text-indigo-600 dark:bg-indigo-400/15 dark:text-indigo-300",
  "bg-zinc-100 text-zinc-700 dark:bg-zinc-400/15 dark:text-zinc-300",
  "bg-amber-50 text-amber-600 dark:bg-amber-400/15 dark:text-amber-300",
  "bg-rose-50 text-rose-500 dark:bg-rose-400/15 dark:text-rose-300",
  "bg-sky-50 text-sky-600 dark:bg-sky-400/15 dark:text-sky-300",
  "bg-emerald-50 text-emerald-600 dark:bg-emerald-400/15 dark:text-emerald-300",
];

export function tintForCategory(category) {
  const key = category || OTHER_CATEGORY;
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return TINTS[hash % TINTS.length];
}

export default function CategoryIcon({ category, className }) {
  const Icon = iconForCategory(category);
  return <Icon className={className} aria-hidden="true" />;
}
