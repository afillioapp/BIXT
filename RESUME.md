# RESUME — current project state

_Last updated: 2026-07-18_

## Status

**Round 5 (owner's 7-item UI punch list) is COMPLETE on branch
`ui-round-5`, pushed to origin, awaiting orchestrator review + owner live
phone test on the Vercel preview.** `main` was never touched.

All 7 requested changes landed across 4 commits:

1. `9239891` — Home hero carousel. Removed the navy hero's "This week"/
   "Last month" inner tiles and the 4-tile quick-action row (Scan/Transfer/
   Report/Add + its popover). Capture is reached through the bottom-nav
   "+" popover only — **note:** a mid-round owner instruction asked for an
   extra "Scan receipt" pill on Home, then a follow-up message revoked
   that and confirmed capture should stay nav-only; the pill was added and
   then removed again before this commit landed, so `pages/index.js` has
   no capture entry point of its own. In its place: a 3-panel CSS
   scroll-snap carousel (`components/HomeCarousel.js`) — weekly bar chart
   with week arrows, a by-category donut, and a top-categories list (the
   latter two sharing one month-offset arrow pair) — all dark-restyled and
   reusing Stats' own math. `lib/useMonthRows.js` is a new shared hook
   (per-month expense-row cache + on-demand Drive fetch) used by both
   `pages/index.js` and `pages/stats.js` so they never double-fetch a
   month and always agree on numbers.
2. `22db548` — Settings navy identity header (title, large avatar, name,
   email centered on brand-navy, generous padding) + shortened the Drive
   row's label from "Receipts saved to Drive of" to "Drive".
3. `0bda511` — Navy rounded-bottom header block added to History, Stats,
   and Capture (title + subtitle where present, white text; DriveFallback
   states keep the same header above the fallback card). New
   `components/CategoryIcon.js` maps category name (+ legacy pre-v1
   aliases) to a lucide icon, used on both History rows and Home's Recent
   Expenses rows in place of the old tinted first-letter square. Fixed
   long vendor names compressing the icon square on both lists (icon
   square `shrink-0`, text container `min-w-0` + `truncate`).
4. (this commit) — `components/BottomNav.js`'s "+" popover restyled: the
   two pills are now a side-by-side horizontal pair (teal "Scan", navy
   "Gallery" — shortened labels) centered above the fab, positioned higher
   (`bottom-[calc(100%+30px)]` vs the previous `+18px`). Capture pipeline
   (hidden inputs → pendingCapture → `/capture`) unchanged.

## Deviations from the written brief

- **Commit 1 churn (see above):** an in-flight "owner veto" message asked
  for a Home-page "Scan receipt" button; a second message revoked it
  before the commit landed. Net effect on `pages/index.js` is zero — it
  matches the original brief (hero + carousel + Recent Expenses + feedback
  card, capture nav-only). Flagging here in case the owner's intent still
  needs a Home-page scan entry point in a future round.
- **Error surfacing on Home/Stats initial load:** the old per-page fetch
  effects had a top-level `try/catch` that set a page `error` string on
  any Drive failure. `lib/useMonthRows.js` swallows per-month fetch errors
  silently (matching the *existing* period-navigation behavior stats.js
  already had) so a failed month just stays "Loading…" and retries next
  time `ensureMonths` is called for it, rather than surfacing red error
  text. Low risk (DriveFallback still gates the whole page on
  connect/auth failures) but worth knowing about.
- Category donut/progress-list palette on the Home carousel intentionally
  keeps the exact same 4-hex palette Stats uses (`#0FB5A7 #1E2A44 #F59E0B
  #FB7185`) per the brief's "same 4-color palette" instruction, even
  though the navy-hex entry (`#1E2A44`) is low-contrast against the navy
  hero card it now sits on. Segments still have a legend label, so
  identity never depends on color alone.

## Untouched per the do-not-touch list

`lib/useDrive.js`, `lib/google.js`, `lib/biometric.js`, `lib/image.js`,
`lib/pendingCapture.js`, `lib/insights.js` math (only new imports of its
existing exports; math functions themselves are byte-identical),
`lib/theme.js`, `pages/api/extract.js`, `next.config.js`,
`chrome-extension/`, `UI UX/`, `design_handoff_bxt_app/`, `lovable-design/`,
`inter/`. All behavioral guards (onboarding redirect, 401 retry-once,
DriveFallback gating, biometric gate, pendingCapture flow,
confirm-before-share, theme toggle, disconnect-before-signOut) verified
still in place.

## Next step

Every commit builds clean (`✓ Compiled successfully`; the later "Failed
to collect page data" / Firebase `auth/invalid-api-key` error is the
expected-and-documented local-only failure — env keys live in Vercel).
Branch is pushed. Next step is orchestrator (Fable) review of the Vercel
preview deploy for `ui-round-5`, then owner phone test, then merge to
`main` per `docs/REPO-WORKFLOW.md`.
