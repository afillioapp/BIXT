#!/usr/bin/env node
/*
 * BX redesign verification gates (02-TECH-PLAN.md §6.4, Tier 2).
 *
 * Three gates, each catching a failure mode that a green `next build` does
 * NOT catch:
 *
 *   1. token-parity  — every custom property in :root has a .dark value.
 *                      Guards R1 (dark mode ships unreadable).
 *   2. utility-exists — every token-derived class name in live use (§2.2)
 *                      appears in the compiled CSS. Tailwind emits *nothing*
 *                      for an unknown utility and does not error, so a
 *                      renamed token silently un-styles the app. Guards R2.
 *   3. frozen-strings — the sheet header, the 12 category names (twice) and
 *                      the "BX - " Drive prefix are byte-identical to main.
 *                      Guards R5 (corrupting real users' accounting records).
 *
 * Run: npm run verify
 */
import { execFileSync } from "node:child_process";
import { readFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

let failures = 0;
const fail = (gate, msg) => {
  failures++;
  console.error(`  ✗ [${gate}] ${msg}`);
};
const ok = (gate, msg) => console.log(`  ✓ [${gate}] ${msg}`);

// ---------------------------------------------------------------- gate 1
// Every custom property declared in :root must also be declared in .dark.
// --radius is the one intentional exception (a single scale for both themes).
const PARITY_EXEMPT = new Set(["--radius"]);

function blockOf(css, selector) {
  // Grabs the body of the first top-level `selector { ... }` block.
  const start = css.indexOf(selector);
  if (start === -1) return null;
  const open = css.indexOf("{", start);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < css.length; i++) {
    if (css[i] === "{") depth++;
    else if (css[i] === "}") {
      depth--;
      if (depth === 0) return css.slice(open + 1, i);
    }
  }
  return null;
}

const propsIn = (body) =>
  new Set([...body.matchAll(/^\s*(--[a-zA-Z0-9-]+)\s*:/gm)].map((m) => m[1]));

console.log("token-parity");
const cssSrc = readFileSync("styles/tailwind.css", "utf8");
const rootBody = blockOf(cssSrc, "\n:root {");
const darkBody = blockOf(cssSrc, "\n.dark {");
if (!rootBody || !darkBody) {
  fail("token-parity", "could not locate :root and/or .dark block");
} else {
  const rootProps = propsIn(rootBody);
  const darkProps = propsIn(darkBody);
  const missing = [...rootProps].filter(
    (p) => !PARITY_EXEMPT.has(p) && !darkProps.has(p)
  );
  if (missing.length) {
    for (const p of missing) fail("token-parity", `${p} has no .dark value`);
  } else {
    ok("token-parity", `${rootProps.size} tokens, all have a .dark value`);
  }
  // A .dark-only token is also a smell — it means light mode falls back to
  // whatever the browser default is.
  const orphans = [...darkProps].filter((p) => !rootProps.has(p));
  for (const p of orphans) fail("token-parity", `${p} is .dark-only`);
}

// ---------------------------------------------------------------- gate 2
// Token-derived utilities in live use, from 02-TECH-PLAN.md §2.2. If a token
// is renamed without updating call sites, these vanish from the output.
const REQUIRED_UTILITIES = [
  "bg-brand-navy",
  "shadow-brand-navy/25",
  "text-brand-navy",
  "bg-brand-teal",
  "text-brand-teal",
  "bg-brand-teal-soft",
  "bg-background",
  "bg-surface/85",
  "text-text-primary",
  "text-text-secondary",
  "text-destructive",
  "bg-destructive",
  // Introduced by WP1. Each one replaced a hardcoded literal, so if any of
  // these stops emitting CSS the surface it paints goes transparent.
  "bg-card",
  "ring-hairline",
  "divide-hairline",
  "border-hairline",
  "ring-input-border",
  "bg-track",
  "bg-track-strong",
  "text-chrome",
  "bg-chrome-surface",
  "bg-chrome-surface-strong",
  "hover:bg-hover",
  "bg-scrim",
  "text-ink-foreground",
  "bg-ink-foreground",
  "bg-ink-foreground/15",
  "ring-ink-foreground/20",
  "text-ink-foreground/60",
  "text-on-ink-destructive",
  "text-brand-teal-foreground",
  "text-action-foreground",
  "fill-on-chart-label",
  "shadow-card",
];

// Category tokens are consumed as `var(--cat-N)` from JS (CategoryIcon's
// accent map, the donut palettes), not as Tailwind utilities — so the
// utility gate above cannot see them. Check the custom properties directly.
const REQUIRED_CUSTOM_PROPS = Array.from(
  { length: 12 },
  (_, i) => `--cat-${i + 1}`
).concat(["--chart-track"]);

// Tailwind escapes `/` and the variant `:` in the emitted selector, so
// `hover:bg-hover` lands as `.hover\:bg-hover:hover`.
const selectorFor = (u) => "." + u.replace(/[/:]/g, (c) => "\\" + c);

console.log("utility-exists");
try {
  const out = join(mkdtempSync(join(tmpdir(), "bx-verify-")), "bx.css");
  execFileSync(
    "npx",
    ["@tailwindcss/cli", "-i", "styles/tailwind.css", "-o", out],
    { stdio: "pipe" }
  );
  const compiled = readFileSync(out, "utf8");
  const missing = REQUIRED_UTILITIES.filter(
    (u) => !compiled.includes(selectorFor(u))
  );
  if (missing.length) {
    for (const u of missing)
      fail("utility-exists", `${u} emits no CSS (token renamed or removed?)`);
  } else {
    ok(
      "utility-exists",
      `all ${REQUIRED_UTILITIES.length} load-bearing utilities present`
    );
  }

  // var(--cat-N) is read from JS, so it never appears as a utility.
  const missingProps = REQUIRED_CUSTOM_PROPS.filter(
    (p) => !compiled.includes(`${p}:`)
  );
  if (missingProps.length) {
    for (const p of missingProps)
      fail("utility-exists", `${p} is not emitted (read via var() from JS)`);
  } else {
    ok(
      "utility-exists",
      `all ${REQUIRED_CUSTOM_PROPS.length} JS-consumed custom properties emitted`
    );
  }
} catch (e) {
  fail("utility-exists", `tailwind CLI failed: ${e.message}`);
}

// ---------------------------------------------------------------- gate 3
// Frozen schema. These strings are written into real users' Drive files;
// changing one orphans or corrupts live accounting records (R5).
const OFFICIAL_12 = [
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

const categoryArrayIn = (file, declaration) => {
  const src = readFileSync(file, "utf8");
  const at = src.indexOf(declaration);
  if (at === -1) return null;
  const close = src.indexOf("];", at);
  if (close === -1) return null;
  return [...src.slice(at, close).matchAll(/"((?:[^"\\]|\\.)*)"/g)].map(
    (m) => m[1]
  );
};

console.log("frozen-strings");

const header = categoryArrayIn(
  "lib/google.js",
  "const EXPENSE_SHEET_HEADER = ["
);
const EXPECTED_HEADER = [
  "Date",
  "Vendor",
  "Category",
  "Total",
  "HST",
  "Receipt Link",
];
if (!header) fail("frozen-strings", "EXPENSE_SHEET_HEADER not found");
else if (header.join("|") !== EXPECTED_HEADER.join("|"))
  fail("frozen-strings", `sheet header changed: ${header.join("|")}`);
else ok("frozen-strings", "EXPENSE_SHEET_HEADER 6-column layout intact");

for (const [file, decl, label] of [
  ["pages/api/extract.js", "const CATEGORIES = [", "extract.js CATEGORIES"],
  [
    "components/CategoryIcon.js",
    "export const OFFICIAL_CATEGORIES = [",
    "CategoryIcon OFFICIAL_CATEGORIES",
  ],
]) {
  const got = categoryArrayIn(file, decl);
  if (!got) fail("frozen-strings", `${label} not found`);
  else if (got.join("|") !== OFFICIAL_12.join("|"))
    fail("frozen-strings", `${label} drifted: ${got.join("|")}`);
  else ok("frozen-strings", `${label} byte-identical (12 names)`);
}

const googleSrc = readFileSync("lib/google.js", "utf8");
if (!googleSrc.includes("`BX - ${companyName}`"))
  fail("frozen-strings", "Drive root folder prefix `BX - ` changed");
else if (!googleSrc.includes("name contains 'BX - '"))
  fail("frozen-strings", "Drive root folder search prefix `BX - ` changed");
else ok("frozen-strings", "`BX - ` Drive folder prefix intact (create + search)");

const legacyAliases = [
  "Meals & Entertainment",
  "Office Supplies",
  "Software & Subscriptions",
  "Marketing & Advertising",
  "Equipment",
  "Fuel & Vehicle",
];
const iconSrc = readFileSync("components/CategoryIcon.js", "utf8");
const droppedAliases = legacyAliases.filter((a) => !iconSrc.includes(a));
if (droppedAliases.length)
  fail(
    "frozen-strings",
    `legacy category aliases dropped (old rows lose their icon): ${droppedAliases.join(", ")}`
  );
else ok("frozen-strings", "6 legacy category aliases still mapped");

// ----------------------------------------------------------------- result
console.log("");
if (failures) {
  console.error(`FAILED — ${failures} gate violation(s)`);
  process.exit(1);
}
console.log("All gates passed.");
