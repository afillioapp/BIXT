# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

BX (branded BX in the UI; repo/folder names still say BIXT/expense-tracker
for historical reasons — not worth renaming) is a receipt-scanning business
expense tracker: snap or import a receipt photo → Claude reads
place/total/HST/date → saved to the user's own Google Drive, with an
accountant given automatic read-only access. No traditional backend
database — Google Drive itself is the data store.

Deployed at `bixt.vercel.app`, on a Vercel account under
`alireza.m@afillio.ca` (a different Vercel account/team than may be
connected to any MCP tooling in a given session — check the Vercel
dashboard directly if a connected integration doesn't show this project).

**Product philosophy** (drives every product/copy/scope decision, not just
code): built for a small business owner, not a technical user. Pricing
should feel like a ~$3 impulse buy, not enterprise SaaS. Language must be
jargon-free. If a feature needs explaining, it's too complicated for this
audience.

A separate living doc — full user journeys, tech stack per step, known
bottlenecks, phasing — is maintained outside this repo at
`../BX Blueprint/BX-Blueprint.md` (sibling folder, intentionally not
git-tracked). Check it for current project status before assuming what's
done vs. pending.

## Commands

```
npm run dev     # local dev server
npm run build   # production build (also runs lint + type checking)
npm run start   # run a production build locally
```

No test suite exists (no test files, no test script). `npm run build` will
fail locally at the "Collecting page data" step with a Firebase
`auth/invalid-api-key` error unless a real `.env.local` is present — this
is expected (see Environment variables below), not a regression signal;
"Compiled successfully" before that point is what to check.

## Architecture

### Two auth systems, deliberately decoupled

Firebase Auth (`lib/firebase.js`) handles *who is signed in* — Google,
Apple, phone/SMS OTP, gated in `pages/_app.js` via `onAuthStateChanged`.
Google Drive/Sheets access is a **separate** OAuth grant via Google
Identity Services (GIS), managed entirely in `lib/useDrive.js`. These are
intentionally independent: Firebase's OAuth token is never used for Drive
API calls. A user can be Firebase-authenticated with no Drive connection
yet, or vice versa isn't possible but the two states are tracked
separately (`user` from Firebase, `accessToken`/`profile` from
`useDrive()`).

`pages/_app.js`'s auth check has a 5s fail-open timeout: if
`onAuthStateChanged` never fires (seen in testing when Firebase's
IndexedDB persistence layer was corrupted), the app redirects to `/login`
instead of hanging on a permanently blank page. Similarly,
`lib/useDrive.js`'s GIS script loading has its own timeout + explicit
`.catch()` — a missing `.catch()` here previously caused the Camera page to
hang on "Loading…" forever if the script failed to load. Don't remove
either timeout without understanding why they're there.

Google sign-in uses `signInWithRedirect` on mobile and `signInWithPopup` on
desktop (`pages/login.js`) — mobile browsers block/mishandle popup-based
OAuth, which is why the split exists.

### Drive as the data store

No database. Everything lives in the user's own Drive:

```
BX - {Company Name}/          <- root, found via a Drive search for
                                  name contains 'BX - ' (single company
                                  per Google account is assumed)
  {Year}/
    {Month name}/
      Supporting Documents/    <- compressed receipt photos
      Expenses                <- Google Sheet: Date | Vendor | Category | Total | HST | Receipt Link | Type | Note for accountant
```

Year folders are calendar years even when the business's fiscal year isn't
(the fiscal year only changes how the app's Year view groups months).

Type (column G) is `Expense` (the owner was invoiced, money out) or `Income`
(the owner is invoicing, money in), asked on every capture. Older sheets get
the header on their next save or row edit and their blank cells read as
`Expense`. The Type column is found by its header, not its position, and is
only ever added: if column G already holds anything of the owner's, a new
column is inserted so theirs moves right. "Note for accountant" (H, right
after Type) works the same way; both go through `ensureBxColumns`. Run
`../.claude/tools/sheet-test/test.mjs` before changing any of this.
Income is excluded from every spending total (`spendingRows` in
`lib/insights.js`). `ensureHeaderRow` migrates every older layout in place;
`lib/google.js` documents each one.

The user's profile (company name, accountant email, `fiscalYearStart` 1-12,
`currency` code (default CAD), optional `bankName` + `bankLast4`) is stored as custom Drive **file
properties** on the root folder itself (`getProfile`/`saveProfile` in
`lib/google.js`) — no separate profile file clutters the user's Drive.
`saveProfile` writes only the keys it is given, so pass just the field being
changed. Renaming the company in Settings also renames the folder to
`BX - {name}` (`renameCompanyRootFolder`); the folder is found by its hidden
`bxRoot` marker, so renames are safe. `currency` drives every amount in the
app (`formatCurrency(n, { currency })`) and the Total/HST format of month
sheets created after it is set. A user with no BX root folder yet is routed to
`pages/setup.js`; finding an existing one routes straight to the Camera tab.

`lib/google.js` also exposes read-only lookup variants (`findFolderId`,
`findSheetId`, `findMonthExpenseSheetId`) that never create anything — used
by `pages/history.js` so browsing history has no side effects, unlike the
create-if-missing orchestrators (`ensureMonthFolders`, `saveExpenseToDrive`)
used on the save path.

### Receipt capture pipeline

`pages/capture.js` (reached from the camera in the bottom menu) → user takes
photos or picks several from their library — a batch; each is read in the
background, one after another, then reviewed one at a time ("Receipt 2 of
5", Save & next / Skip for now) → `lib/image.js` compresses it
client-side via canvas (target ~200KB, JPEG re-encode regardless of source
format) → POST to `pages/api/extract.js` (server-side, keeps
`ANTHROPIC_API_KEY` off the client) → Claude vision returns structured
fields → editable review UI shows only 4 of them (place/total/hst/date;
the API also returns currency/category/notes, intentionally unused in the
UI) → confirm writes through `saveExpenseToDrive`.

### Routes

- `pages/login.js` — splash (Sign In / Sign Up copy-only distinction, both
  reveal the same Google/Apple/Phone buttons)
- `pages/setup.js` — one-time onboarding (company name + accountant email),
  only reached when authenticated but no BX root folder exists yet
- `pages/index.js` — Home: fiscal-year activity grid
  (`components/ActivityGraph.js`, money out vs in, shade = amount), month
  total, spending bar chart (`components/HomeCarousel.js`), Top Categories,
  recent receipts
- `pages/history.js` — current + previous month's receipts (two Sheet
  reads; deliberately not a full walk of every month ever, for performance)
- `pages/settings.js` — company name, connected account, editable
  accountant email, sign out
- `components/BottomNav.js` — Home | Camera (raised, teal, opens Take
  photo / Choose a photo) | Settings, hidden on `/login` and `/setup`
  (`pages/_app.js` decides this by route, not by re-deriving Drive state)

### Chrome extension (`chrome-extension/`) — Phase 2, parked

A separate, unrelated build (plain MV3 JS/HTML/CSS, no bundler) for
capturing online-purchase receipts from the browser. Deliberately **not**
sharing code with the Next.js app — `chrome-extension/drive.js` and
`chrome-extension/image.js` are hand-ported duplicates of `lib/google.js`
and `lib/image.js`, kept in sync manually since there's no shared package
between the two build systems. Blocked on a manual Google Cloud OAuth
client setup step documented in `chrome-extension/README.md` — currently
untested in a real browser. Not part of Phase 1 (getting the phone app
working); don't prioritize changes here unless explicitly asked.

### Styling

Tailwind 4. Every colour is a token in `styles/tailwind.css`: light values
in `:root`, dark values in `.dark` (`lib/theme.js` toggles the class). Use
the tokens, never literal white/black/zinc, or that element stays light in
dark mode: `bg-card` (cards, inputs, sheets), `ring-hairline` /
`ring-hairline-strong` (outlines), `divide-hairline`, `bg-muted` (chart
tracks, hover), `bg-track` (toggle off, dots), `text-text-primary` /
`-secondary` / `-tertiary`. The login and lock screens are navy in both
themes on purpose.

## Environment variables

Set in Vercel only — no `.env.local` exists in this repo:

- `ANTHROPIC_API_KEY`
- `NEXT_PUBLIC_FIREBASE_API_KEY`, `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN`,
  `NEXT_PUBLIC_FIREBASE_PROJECT_ID`, `NEXT_PUBLIC_FIREBASE_APP_ID`
- `NEXT_PUBLIC_GOOGLE_CLIENT_ID`

## Known, deliberate gaps (not bugs)

One feature remains intentionally deferred, pending a product decision —
don't build it speculatively:

- **2-step/email verification** after signup — not built; signup currently
  goes straight from Google sign-in to the onboarding form.

(The formerly-deferred **biometric check** shipped 2026-07-08 as an opt-in
local device lock: `lib/biometric.js` + `components/BiometricGate.js`,
toggled in Settings. It's a WebAuthn platform-authenticator gate stored in
localStorage — a casual-access lock, deliberately not server-verified auth.)

See `BX Blueprint/BX-Blueprint.md` for the full status of every step in
both journeys, including what's fixed, what's untested, and what's blocking.
