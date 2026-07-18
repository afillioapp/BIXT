# RESUME — current project state

_Last updated: 2026-07-18_

## Status

**Swipe-to-act expense rows are COMPLETE on branch `swipe-actions`, pushed
to origin, awaiting orchestrator review + owner live phone test on the
Vercel preview.** `main` was never touched.

Owner request, modeled on CamScanner's swipe-reveal row actions: swiping an
expense row left on Home's Recent Expenses list or on History reveals three
actions — Receipt (open the photo), Edit (bottom-sheet form), Delete
(confirm-before-destroy). Landed across 4 commits:

1. `fcaf0d4` — `lib/google.js`'s `listExpenseRows` now stamps every row
   with `sheetId`, `rowIndex` (1-based sheet row, computed from each row's
   original position *before* the empty-row filter so filtered blanks
   never shift later indices), `layout` (`"v1"`/`"v2"`), and for v1 rows
   `hadTrailingCategory`. New exports `deleteExpenseRow` (batchUpdate
   deleteDimension) and `updateExpenseRow` (writes the full row back in
   the correct column order for that row's layout, routed through the
   same `sanitizeSheetText`/`cleanAmount` helpers `saveExpenseToDrive`
   uses). `lib/useMonthRows.js` gained `invalidateMonth(date)` — drops
   that month's cache entry and immediately re-fetches it.
2. `8f3fe12` — New `components/ExpenseRow.js`: one shared swipeable row for
   both lists. Touch + mouse drag slides the row content left up to 192px,
   revealing three equal action buttons (Receipt/Edit/Delete) clipped to
   the row's own rounded corners. Only one row is ever open at a time (a
   parent-owned `openId`/`onOpenChange` pattern). Tapping closed content
   opens the receipt link (old behavior preserved); tapping open content
   closes it. Delete swaps in place to a "Delete? / Cancel" confirm state
   before ever calling `onDelete` — no one-tap destructive action.
3. `e381f22` — Wired into `pages/index.js` and `pages/history.js`. Both
   share one edit bottom-sheet (`components/EditExpenseSheet.js`: Vendor,
   Category — from the new `OFFICIAL_CATEGORIES` export in
   `components/CategoryIcon.js` — Total, HST, Date), which calls
   `updateExpenseRow` and surfaces errors inline instead of closing.
   Delete calls `deleteExpenseRow`. Every mutation refreshes from Drive
   rather than splicing rows locally (a delete/edit shifts every later
   row's sheet index in that month's sheet): Home uses
   `useMonthRows`'s `invalidateMonth` on the current + previous month;
   History's two-month fetch was extracted into a callable `load()` that
   re-runs after a mutation. Deleting only removes the sheet row — the
   receipt photo deliberately stays in Drive (commented at both call
   sites).
4. (this commit) — RESUME.md refresh + a small visual fix: the row's
   `ring-1 ring-black/5` border (present on the original plain-`<a>` rows)
   had been dropped when the row visuals moved into `ExpenseRow.js`;
   restored on the row's outer container.

## Deviations from the written brief

- `updateExpenseRow`'s signature keeps the brief's exact positional args
  (`token, sheetId, rowIndex, layout, { date, place, category, total, hst,
  receiptLink }`) but the options object also accepts `hadTrailingCategory`
  — the brief's own prose says v1's trailing-Category write needs that
  flag, and `layout` alone (just `"v1"`/`"v2"`) can't carry it, so it rides
  along on the same object that `listExpenseRows` already attaches it to.
- The brief said Receipt should be "disabled/hidden when no link" — kept
  as a disabled (grayed, non-interactive) button rather than removing it
  from layout, so the three action slots stay equal width and the row
  never reflows depending on data.
- Delete's confirm state ("Delete? / Cancel") replaces only the Delete
  button's own 64px slot with two ~32px buttons side by side, not the
  full three-button row — matches "swaps in-place" literally.
- `pages/history.js`'s old per-request `cancelled` guard (to avoid a
  post-unmount `setState`) was dropped when the fetch was extracted into a
  callable `load()` — safe on React 18 (this repo's version), which no
  longer warns/breaks on that pattern.

## Untouched per the do-not-touch list

`lib/useDrive.js`, `lib/biometric.js`, `lib/image.js`,
`lib/pendingCapture.js`, `lib/theme.js`, `lib/insights.js` math (only
consumed, unmodified — `latestReceipts` is a pure sort/slice, new row
fields pass through untouched), `pages/api/extract.js`, `next.config.js`,
`chrome-extension/`, `UI UX/`, `design_handoff_bxt_app/`,
`lovable-design/`, `inter/`. `lib/google.js` only gained new functions
(`deleteExpenseRow`, `updateExpenseRow`, `putValuesUserEntered`) plus
additive fields on `listExpenseRows`' return shape — every existing
function's behavior is unchanged. All behavioral guards (onboarding
redirect, 401 retry-once, DriveFallback gating, biometric gate,
pendingCapture flow, confirm-before-share, theme, disconnect-before-
signOut) verified still in place.

Note: an orchestrator commit (`f340be8` — Stats "By Category" donut
redesign, `pages/stats.js` only) landed on this branch mid-run because the
working tree was checked out here when it was made. It's independent of
this work (only touches the Donut component + legend) and was kept as
instructed.

## Next step

Every commit builds clean (`✓ Compiled successfully`; the later "Failed
to collect page data" / Firebase `auth/invalid-api-key` error is the
expected-and-documented local-only failure — env keys live in Vercel).
Branch is pushed. Next step is orchestrator (Fable) review of the Vercel
preview deploy for `swipe-actions`, then owner phone test (swipe gesture
feel is best judged on an actual touchscreen), then merge to `main` per
`docs/REPO-WORKFLOW.md`.
