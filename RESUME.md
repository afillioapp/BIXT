# RESUME — current project state

_Last updated: 2026-07-17_

## Status

**The Lovable navy/teal restyle is COMPLETE on branch `lovable-navy-teal`,
pushed to origin, awaiting orchestrator review + owner live phone test on
the Vercel preview.** `main` was never touched.

This branch retints the app (previously monochrome, from the
`design-handoff-restyle` era already merged to `main`) to the owner-approved
Lovable design handoff — navy (`--accent`) + teal (`--highlight`) — using
the cloned reference at `../lovable-design/` (sibling to this repo, NOT
`expense-tracker/lovable-design/` as originally briefed; it stays untracked
either way, see `.gitignore`). Only the look changed: no Drive/Firebase/
biometric/capture behavior was touched.

Commits (oldest first):

1. `f5a106a` — Step 1: navy/teal oklch tokens translated from
   `lovable-design/src/styles.css` onto the existing var names (`--accent`
   -> brand navy, `--highlight` -> brand teal, new `--highlight-soft` tint
   slot). Brand colors are theme-invariant (stay identical light/dark, like
   the source design's own `--brand-navy`/`--brand-teal`); a new
   `--logo-ink` slot keeps the wordmark readable in dark mode where
   `--accent` no longer auto-flips. DM Sans -> Inter in `pages/_app.js`
   (same `--font-sans`/`--font-serif` plumbing). `components/Logo.js`:
   navy letters (`var(--logo-ink)`) / teal underline, new `onDark` prop.
   `lovable-design/` added to `.gitignore`.
2. `6f948dd` — Step 2: `components/BottomNav.js` rebuilt per
   `lovable-design/BottomNav.tsx` — fixed full-width translucent
   (backdrop-blur) bar instead of the old floating pill, 5 columns (Home,
   Stats, raised navy "+", History, Settings — Settings folded back into
   the nav, replacing the per-page header gear icon). New `pages/stats.js`
   hosts the `InsightCards` carousel, loading rows the same way
   `pages/index.js` does (current + previous month, `DriveFallback` gated)
   but without the setup redirect, which stays Home's job. `pages/index.js`
   slimmed: carousel + gear icon removed (total card already resolves navy
   via `--accent`). `pages/history.js`: gear icon removed.
3. `1250172` — Step 3 + owner addition: `InsightCards.js` donut ramp now
   teal (`#0fb5a7`) -> navy (`#1e2a44`); today's weekly-bar label recolored
   teal. `globals.css`: input/select focus border, the "See all" `.link`,
   and the login screen's `.lp-shape` tint switch to
   `var(--highlight)`/`var(--highlight-soft)`; dead `.header-gear` rule
   removed. Buttons/toggles/DriveFallback/lock/splash needed no direct
   edit — they already read `var(--accent)`/`var(--highlight)` and picked
   up navy/teal automatically from step 1. Swept for leftover blue
   `#2196f3` / charcoal `#232323` literals — none remain outside Google's
   official multi-color "G" logo on the login button (left as-is,
   intentional). **Owner addition** (mid-task, out-of-brief): Home header
   gets back a round avatar (top-right, links to `/settings`) — the user's
   Google `photoURL` when present, or a navy/white initials circle for
   phone sign-in users with none. Not shown on the `DriveFallback` loading
   state.

Also present on this branch: `6d27d3e` — a small orchestrator-authored prep
commit (iPhone home-screen icon + navy/teal favicon in `public/`),
unrelated to the numbered steps above; landed on the branch mid-session,
intentional, kept as-is.

Every commit built with `npm run build` -> "✓ Compiled successfully" (the
subsequent Firebase `auth/invalid-api-key` / "Failed to collect page data"
error is expected locally — keys live only in Vercel; confirmed the app
also can't run in `npm run dev` locally for the same reason — this is a
pre-existing, documented constraint, not something this branch introduced).

## Files touched by this branch

`styles/globals.css`, `pages/_app.js`, `pages/index.js`, `pages/history.js`,
`pages/stats.js` (new), `components/Logo.js`, `components/BottomNav.js`,
`components/InsightCards.js`, `.gitignore`, `RESUME.md`.

NOT touched: `lib/useDrive.js`, `lib/google.js`, `lib/biometric.js`,
`lib/image.js`, `lib/pendingCapture.js`, `lib/theme.js`, `lib/insights.js`
(math/icons — only the unused-elsewhere `CATEGORY_COLOR_RAMP`/
`categoryColor` grayscale export was left alone too, since nothing renders
it and it contains no blue/charcoal literals to sweep), `pages/api/extract.js`,
`pages/login.js`, `pages/setup.js`, `pages/settings.js`, `pages/capture.js`,
`components/DriveFallback.js`, `components/SplashLoader.js`,
`components/BiometricGate.js`, `next.config.js`, `chrome-extension/`,
`UI UX/`, `design_handoff_bxt_app/`, `inter/`.

## Deviations from the brief

- **Design source location**: read from `../lovable-design/` (sibling to
  this repo) instead of `expense-tracker/lovable-design/` as briefed — the
  clone was never nested inside this repo. Functionally identical outcome
  (still untracked, still gitignored under the `lovable-design/` pattern
  which matches either location relative to repo root).
- **Login/lock/splash pages**: not rewritten wholesale to match
  `lovable-design`'s actual `login.tsx` (a different Face-ID-first auth
  flow that doesn't exist in this app) — per the owner's explicit scope
  ("Google pill navy, shapes tinted with `--highlight-soft`"), only the
  color tokens were retinted; the Google/Phone/OTP flow itself is
  unchanged, and both the pill and shapes picked up the right colors
  automatically once `--accent`/`--highlight-soft` were set in step 1.
- **`CATEGORY_COLOR_RAMP`/`categoryColor`** in `lib/insights.js` (a
  grayscale ramp, unused by any current caller — the donut uses
  `InsightCards.js`'s own `DONUT_RAMP_START/END` instead) was left
  untouched: it's dead code, not a rendered surface, and has no blue/
  charcoal literal to sweep.

## Next

1. Orchestrator (Fable) review of `lovable-navy-teal` vs `main` — focus:
   no behavior drift in guards (setup redirect, 401 retry-once save,
   `DriveFallback` usage, biometric gate + auto-attempt, capture popover
   `pendingCapture` flow, confirm-before-share, theme toggle), dark-mode
   contrast (verified via a throwaway static HTML mockup against the real
   `globals.css` — brand colors correctly stay constant across themes,
   neutrals correctly flip), Stats page's Drive-gating parity with Home.
2. Owner live phone test on the branch's Vercel preview: all 5 nav tabs,
   the raised "+" popover (teal/navy cards), Stats charts, Home avatar
   (both photo and initials-fallback paths — the latter needs a phone
   sign-in account to see), dark mode toggle, login screen shapes/button.
3. Merge to `main` only after both pass (`main` auto-deploys instantly).

## Warnings

- Pushes to `main` deploy **instantly** to production (bixt.vercel.app).
- `chrome-extension/` is parked (Phase 2) — untouched.
- Leave `lovable-design/`, `design_handoff_bxt_app/`, `UI UX/`, `inter/`,
  and `"BX Receipt Tracking App.zip"` untracked.
- The app cannot run locally (`npm run dev` or a full `npm run build`
  pass-through) without real Firebase env vars — this is pre-existing,
  not introduced by this branch. Visual verification of CSS/layout
  changes during this branch's work was done via a throwaway static HTML
  mockup that `<link>`s the real `styles/globals.css`, not the live app.
