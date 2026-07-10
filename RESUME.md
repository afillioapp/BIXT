# RESUME — current project state

_Last updated: 2026-07-09 (late evening)_

## Status

**Design-handoff restyle is COMPLETE on branch `design-handoff-restyle`,
pushed to origin, awaiting orchestrator review + owner live phone test on
the Vercel preview.** `main` was never touched.

This branch applies the approved BXT design handoff
(`design_handoff_bxt_app/README.md` + `BXT-prototype.html`, both untracked)
— a full monochrome re-skin plus the BXT rebrand — over the app as it stood
on `main` (which already included the earlier `ui-redesign` work).

Commits (oldest first):

1. `645c74a` — Step 1: monochrome design tokens mapped onto the existing
   CSS var names (`--bg/--surface/--card/--accent/--text/--muted/--border/
   --error`, new `--surface2`/`--ink-soft`/`--on-dark`); Source Serif 4 +
   Inter via next/font/google exposed as `--font-serif`/`--font-sans` on
   `.app-shell`; pill buttons / radius-20 cards / radius-13 inputs; `<title>`
   -> BXT.
2. `6bfe495` — Step 2: `lib/insights.js` emoji maps replaced with the
   initials-square category system adapted to the official 12-category list
   (12-step grayscale ramp #111111 -> #E4E4E4, legacy aliases map to their
   successors' visuals; all math helpers byte-identical; new
   `categoryTextColor` export). Receipt rows restyled on Home/History
   (History meta line now shows category). DriveFallback restyled as the
   handoff's shared Connect-Drive / Retry cards. `.status` becomes plain
   color-coded inline text.
3. `ec9c4b0` — Step 3: splash = serif BXT wordmark (no logo image); sign-in
   restyle ("Every receipt, filed by itself.", pill providers, legal line);
   phone entry/code restyle; onboarding as a SINGLE page (owner override —
   see deviations) with inline confirm; success screen with real
   `BX - {company} / {year} / {month}` path and explicit "Go to BXT" button.
4. `8b8ab55` — (orchestrator) Apple sign-in removed; Google + Phone only.
5. `2eee3ed` — Step 4: Home restyle (serif name, black avatar, gray total
   strip with serif 32px amount, single-shell insight carousel with NEW
   third "Coming soon" panel, today-black/others-gray bars, legend-left
   donut, plain divided receipt rows, "No receipts yet" + down-arrow empty
   state); Capture restyle (serif "New receipt", staged initial/busy/review
   UI, pill Retake / ✓ Save). Also carried the orchestrator's
   `.lp-btn-google` rule.
6. `7425f9a` — Step 5: History ("Today" group label, ink group headers,
   card-less rows, serif empty state); Settings (divided-row cards, danger
   mismatch warning, 3-state email edit restyled, pill Face ID toggle,
   danger Sign Out); lock screen (serif BXT wordmark + lock glyph + quiet
   underlined sign out).
7. `dbd829d` — Step 6: floating dark pill bottom nav (owner override on the
   handoff's raised-circle bar): fixed centered #111 pill, 18px + safe-area
   above bottom, 4 equal items with inline SVG line icons, active item =
   lighter chip with icon + label; page bottom padding clears the pill.

Every commit built with `npm run build` -> "✓ Compiled successfully" (the
subsequent Firebase `auth/invalid-api-key` / "Failed to collect page data"
error is expected locally — keys live only in Vercel).

## Files touched by this branch

`styles/globals.css`, `pages/_app.js`, `pages/login.js`, `pages/setup.js`,
`pages/index.js`, `pages/capture.js`, `pages/history.js`,
`pages/settings.js`, `lib/insights.js` (icon/color maps only),
`components/SplashLoader.js`, `components/BiometricGate.js`,
`components/DriveFallback.js`, `components/InsightCards.js`,
`components/BottomNav.js`.

NOT touched: `lib/useDrive.js`, `lib/google.js`, `lib/biometric.js`,
`lib/image.js`, `pages/api/extract.js`, `next.config.js`,
`chrome-extension/`, `UI UX/`, `design_handoff_bxt_app/` (untracked),
"BX Receipt Tracking App.zip" (untracked).

## Deviations from the handoff (all owner/orchestrator-approved overrides)

- **Categories**: handoff's 9-category list was stale; the official 12 from
  `pages/api/extract.js` are used, with the handoff's tint-scale VISUAL
  adapted (12-step ramp, initials DM CD TR GT FU AC OS SW MA PS EV OT).
- **Onboarding**: single page instead of the handoff's 2-step flow (owner
  override); confirm-before-share safeguard kept as an inline swap.
- **Success path**: real `BX - {company} / {year} / {month}` structure, not
  the handoff's fictional "My Drive / BXT Receipts / {company}".
- **Bottom nav**: floating dark pill with expanding active chip (owner
  override), not the handoff's raised-circle tab bar.
- **Apple sign-in**: removed entirely (owner decision, commit `8b8ab55`) —
  the handoff still shows three providers.
- The handoff's simulated delays, auto-navigation timers, and dev-only
  state toggles were NOT ported (real async states drive the UI); the
  success screen's auto-redirect was replaced by an explicit "Go to BXT"
  button.
- Weekly %-change renders in one muted tone (monochrome system), not
  red/green.

## Next

1. Orchestrator (Fable) review of `design-handoff-restyle` vs `main` —
   focus: no behavior drift in guards (setup redirect, DriveFallback usage,
   401 retry-once save, biometric gate, 3-state email edit, popup-first
   sign-in), fonts loading, category-visual backward compatibility for
   legacy rows.
2. Owner live phone test on the branch's Vercel preview (all 8 screens,
   swipe carousel incl. new third panel, Face ID toggle, lock screen,
   floating nav).
3. Merge to `main` only after both pass (`main` auto-deploys instantly).

## Warnings

- Pushes to `main` deploy **instantly** to production (bixt.vercel.app).
- `chrome-extension/` is parked (Phase 2) — untouched.
- Leave `design_handoff_bxt_app/`, "BX Receipt Tracking App.zip", and
  `UI UX/` untracked.
