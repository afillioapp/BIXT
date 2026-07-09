# RESUME — current project state

_Last updated: 2026-07-09_

## Status

Sprint 1 and Sprint 2 are merged on `main`, deployed, and verified live.

The **UI redesign** (dashboard home + full-app restyle) is **implemented on
branch `ui-redesign`, pushed to origin, all 8 plan steps committed
individually, awaiting orchestrator review + owner live phone test**.
Plan: `/Users/alireza/.claude/plans/i-have-added-a-declarative-avalanche.md`.

Commits (oldest first):

1. `ce68021` — Category column (F) plumbing: `EXPENSE_SHEET_HEADER` extends
   to `Date|Place|Total|HST|Receipt Link|Category`; `ensureHeaderRow` gets
   an in-place "extend" path for old 5-column sheets; `listExpenseRows`
   reads `A2:F` (`category: r[5] || "Other"`); `saveExpenseToDrive` accepts
   and appends `category`; capture review form gets a category `<select>`
   defaulting to `category_suggestion`.
2. `3499d7e` — Camera flow moved verbatim from `pages/index.js` to new
   `pages/capture.js`. `BottomNav` becomes 4 slots (Home, History, raised
   camera circle -> `/capture` with no label, Settings). `pages/index.js`
   left as a temporary placeholder Home.
3. `345d241` — Real dashboard shell: new `lib/insights.js`
   (`weeklyTotals`, `categoryTotals`, `latestReceipts`, `categoryIcon`);
   `pages/index.js` gets the greeting header (time-based + first name +
   avatar initials), reuses history.js's two-month row fetch, and lists
   the 4 latest receipts with a friendly empty state. DriveFallback
   gating + no-profile setup-redirect guard preserved.
4. `8b5968b` — `components/InsightCards.js`: 2 swipeable cards
   (CSS scroll-snap + dot indicators) — weekly SVG bar chart (today
   highlighted, gridlines, red/green % vs last week) and by-category SVG
   donut (green-family/gray palette, legend with name + %). `dataviz`
   skill's validator was run against the category palette (see deviation
   note below).
5. `e04a9d7` — Login restyle: dropped the "Sign In/Sign Up" splash step
   (was copy-only), single screen with centered tagline, provider buttons
   anchored bottom. Zero auth-logic changes.
6. `a34c395` — Onboarding restyle: "Step 1 of 2" / "Step 2 of 2" indicator
   + big titles over the existing Sprint-2 form/confirm views. No logic
   changes (email regex gate, confirm-before-share, folder-reuse safety
   net, success overlay all intact).
7. `b6109ab` — History restyle: rows now use the same
   icon-square/place+date/amount treatment as the dashboard, grouped
   under per-day date headers. Two-month read + DriveFallback unchanged.
   Removed the now-dead `.history-row` family of CSS classes.

All 7 commits built with `npm run build` -> "✓ Compiled successfully"
(the subsequent Firebase `auth/invalid-api-key` / "Failed to collect page
data" error is expected locally — no `.env.local` exists, keys live only
in Vercel).

## Deviations from spec (documented for review)

- `pages/capture.js`'s default export was renamed `Capture` (was `Camera`)
  for clarity given the new filename — purely cosmetic, no behavior change.
  Everything else in the camera flow moved verbatim.
- The category donut's green-family/gray palette fails the dataviz skill's
  general-categorical `validate_palette.js` checks (lightness band, chroma
  floor) — expected, since it's an intentionally monochrome palette per
  the owner's explicit "green-family/gray" spec, not a rainbow categorical
  set. Mitigation applied per the skill's own fallback rule: every segment
  carries a direct legend label (name + %) and an SVG tooltip, so identity
  never depends on color alone.
- Card 3 for the insight-cards swiper was intentionally not invented —
  plan says it's TBD by the owner.

## What's still TBD (out of scope for this branch)

- Insight card 3 (owner to specify).
- A receipt-detail view (tapping a receipt row currently just opens the
  Drive file link, same as before the redesign).

## Next

1. Orchestrator (Fable) review of the full `ui-redesign` diff against
   `main` — correctness focus: column-F backward compatibility, week/
   percent math in `lib/insights.js`, empty states, no auth-logic drift.
2. Owner live-checks on the Vercel preview for `ui-redesign`: dashboard
   renders with real data; swipe between the 2 insight cards; camera
   circle -> `/capture` -> save a receipt with a category; sheet gains
   the Category header + value; old rows still render (as "Other");
   History groups correctly by date; new login screen; onboarding
   reviewed in code only (owner already onboarded, can't retest live).
3. Merge to `main` only after both pass (`main` auto-deploys instantly).

## Warnings

- Pushes to `main` deploy **instantly** to production (bixt.vercel.app).
  All redesign work is on `ui-redesign` — `main` was never touched.
- `chrome-extension/` is parked and calls `/api/extract` without auth
  (will 401) — known, Phase 2 concern. Not touched by this branch.
- `lib/useDrive.js`, `pages/api/extract.js`, `lib/image.js`, `pages/_app.js`,
  `pages/settings.js`, `chrome-extension/`, and `UI UX/` were not modified
  by this branch (verified via `git diff --stat main...ui-redesign`).
