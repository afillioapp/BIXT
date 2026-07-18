# RESUME — current project state

_Last updated: 2026-07-17_

## Status

**The one-for-one Lovable design port is COMPLETE on branch
`lovable-exact`, pushed to origin, awaiting orchestrator review + owner
live phone test on the Vercel preview.** `main` was never touched.

Context: the previous round (`lovable-navy-teal`, merged to `main` as
`2fd591c`) only translated the design's *colors* onto the old plain-CSS
markup. The owner rejected that — "i want it to look exactly like what
loveable designed. one for one." This branch ports the design's actual
markup/classes verbatim (Tailwind 4 + the design's own oklch token system,
from the reference clone at `../lovable-design/src/` — sibling to this
repo, untracked/gitignored) and wires the app's real logic into it.

Commits (oldest first):

1. `04bd23f` — Step 1 (infrastructure): Tailwind 4 via @tailwindcss/postcss
   (postcss.config.js), `styles/tailwind.css` = lovable-design's styles.css
   ported verbatim (same @theme inline + :root + .dark oklch blocks, same
   brand-navy/brand-teal/background/text-primary/… semantic names; only
   @source paths and the --font-sans → next/font Inter wiring adapted).
   lib/theme.js additionally stamps the `dark` class on <html> (the
   design's `@custom-variant dark` keys off `.dark`, not data-theme) —
   same API, both attributes set together. lib/cn.js (clsx+tailwind-merge),
   components/ui/{button,card,input,select}.js (shadcn primitives, TS
   stripped, classes verbatim). components/Logo.js rebuilt on BXLogo.tsx's
   markup, API-compatible (numeric size / animated / onDark props kept).
2. `f0faac2` — Step 2 (nav + Home): components/BottomNav.js 1:1 from
   BottomNav.tsx (translucent bar, teal active, raised navy rounded-square
   "+" fab) with slots Home/Stats/+/History/Settings; the fab's popover is
   the same take-photo/import → pendingCapture → /capture flow restyled as
   two floating teal/navy pills. pages/index.js 1:1 from routes/index.tsx:
   company-name eyebrow, "Good {timeofday}, {firstName}", photoURL/initials
   avatar → /settings, navy "TOTAL EXPENSES · {MONTH}" card with real month
   total + teal %-chip vs last month (hidden when last month $0) + "This
   week"/"Last month" inner tiles, 4 quick actions (Scan→camera input,
   Transfer→gallery input, Report→/stats, teal Add→photo/import chooser),
   "Recent Expenses" rows with stable per-category tinted first-letter
   squares, View All→/history, rows link to receiptLink. Onboarding
   redirect + DriveFallback gate unchanged.
3. `dcc934b` — Step 3 (Stats): pages/stats.js 1:1 from routes/stats.tsx —
   Week/Month/Year segmented pill (Week = weeklyTotals incl. % vs last
   week + Mon–Sun bars w/ today bold; Month = real W1–W5 buckets + % vs
   last month; Year = on-demand walk of the current year's months via
   findMonthExpenseSheetId/listExpenseRows, cached in state, loading state
   while fetching), By-Category donut with the design's exact 4-color
   palette (#0FB5A7/#1E2A44/#F59E0B/#FB7185, cycled) + TOTAL center +
   right legend, category pill row, Top Categories progress list.
   components/InsightCards.js deleted (this was its only caller).
4. `0f68266` — Step 4 (auth screens): pages/login.js = the design's
   /signup navy hero 1:1 (teal-gradient BX tile, "Track every expense,
   anywhere.", big teal pill → real signInPreferringPopup(Google); NO
   Apple, per owner), quiet "Continue with Phone" → existing phone/OTP
   steps restyled in the same dark language; terms line kept.
   components/BiometricGate.js lock screen = the design's /login Face-ID
   screen 1:1 (BX + "Welcome back", teal Face-ID tile = handleUnlock,
   auto-attempt effect unchanged, error slot, "Sign out" replaces "Use
   passcode instead"). SplashLoader now navy bg + white BX + animated teal
   line (same screen family).
5. `82fe1c3` — Step 5 (Settings + History): pages/settings.js on
   profile.tsx's structure (identity card, then one divided icon-row card)
   with the real rows: Company, Drive-of (+ mismatch warning), Accountant's
   email (inline edit→confirm-before-share flow unchanged), Appearance
   toggle (lib/theme.js), Face ID lock toggle (lib/biometric.js incl.
   availability gating), destructive Sign out (disconnect() before
   signOut). pages/history.js = design-language date groups + the same
   expense-row component as Home; two-month read + all states unchanged.
6. (this commit) — Step 6 (capture + setup + DriveFallback + cleanup):
   pages/capture.js rebuilt in the design language (teal-soft camera tile,
   teal/white pill actions, design inputs; initial/busy/review stages,
   pendingCapture pickup, /setup guard, 401-retry-once save all
   byte-equivalent). pages/setup.js same treatment (single screen, inline
   confirm-before-share kept). components/DriveFallback.js restyled with
   the primitives, three-state gating unchanged. styles/globals.css pruned
   to the only two things still referenced: .app-shell (font wiring) and
   the logo-line-extend splash keyframes.

## Files touched by this branch

package.json / package-lock.json (new deps: tailwindcss,
@tailwindcss/postcss, tw-animate-css, lucide-react, clsx, tailwind-merge,
class-variance-authority, @radix-ui/react-slot, @radix-ui/react-select),
postcss.config.js (new), styles/tailwind.css (new), styles/globals.css
(pruned), pages/_app.js (imports tailwind.css), pages/index.js,
pages/stats.js, pages/login.js, pages/settings.js, pages/history.js,
pages/capture.js, pages/setup.js, components/BottomNav.js,
components/Logo.js, components/SplashLoader.js, components/BiometricGate.js,
components/DriveFallback.js, lib/theme.js (adds the `.dark` class stamp —
API unchanged), lib/cn.js (new), components/ui/{button,card,input,select}.js
(new), components/InsightCards.js (deleted), RESUME.md.

NOT touched: lib/useDrive.js, lib/google.js, lib/biometric.js,
lib/image.js, lib/pendingCapture.js, lib/insights.js, lib/firebase.js,
pages/api/extract.js, next.config.js, chrome-extension/, UI UX/,
design_handoff_bxt_app/, inter/, public/.

## Deviations from the design source (with reasons)

- **BX naming everywhere** — never "Ledgerly"/"Marcus"; eyebrow = real
  company name, greeting = real first name, identity card = real
  user/profile data (per the brief).
- **No Apple sign-in** on the login hero (owner removed it); the design's
  round Google/Apple circles + OR divider are replaced by the single teal
  Google pill + quiet phone link, since Google IS the primary action here.
- **Stats Week tab bolds today** (real-data spec) instead of the mock's
  peak-day highlight; Month/Year keep the peak/current-month highlight.
- **Year tab has no "vs last year" delta** — would require fetching a
  second full year of sheets; not in the brief.
- **Stats category pill row is decorative** ("All" active) — it's
  non-functional in the design source too.
- **Settings rows** carry BX's real settings (Company/Drive/Accountant/
  Appearance/Face ID/Sign out) instead of the mock's static
  Notifications/Security/Help rows (per the brief).
- **Home "Transfer" quick action** opens the gallery-import input (closest
  real behavior; the design's Transfer has no meaning in BX). Label kept
  to match the design 1:1.
- **lib/insights.js untouched** — including the now-unused
  categoryColor/CATEGORY_COLOR_RAMP and categoryIcon exports (math
  functions and icon/color exports were allowed to change but didn't need
  to; leaving them is zero-risk).

## Next

1. Orchestrator review of `lovable-exact` vs `main` — focus: guard parity
   (onboarding redirect, 401 retry-once, DriveFallback three-state,
   biometric gate + auto-attempt + sessionStorage flag, popover→
   pendingCapture→/capture, confirm-before-share in setup + settings,
   theme persistence incl. the new `.dark` stamp, disconnect-before-signOut).
2. Owner live phone test on the branch's Vercel preview (375px): Home hero
   card + chip, quick actions, nav + fab popover, Stats all three ranges +
   donut, login hero, lock screen (needs Face ID enabled), Settings rows +
   toggles, History groups, capture flow end-to-end, dark mode.
3. Merge to `main` only after both pass (`main` auto-deploys instantly).

## Warnings

- Pushes to `main` deploy **instantly** to production (bixt.vercel.app).
- The app cannot run locally (Firebase env keys live only in Vercel);
  `npm run build` → "✓ Compiled successfully" is the local gate, the
  later auth/invalid-api-key page-data error is expected.
- Dark mode now flows through BOTH html attributes: data-theme (legacy,
  harmless) and the `.dark` class (what the Tailwind tokens key off).
- `lovable-design/`, `design_handoff_bxt_app/`, `UI UX/`, `inter/`,
  `"BX Receipt Tracking App.zip"` stay untracked.
