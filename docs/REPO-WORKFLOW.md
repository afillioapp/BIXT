# BX Repository Workflow

Rules for all agents and contributors working in this repo.

## Branch strategy

- **`main` = production.** Every push to `main` auto-deploys to production
  (bixt.vercel.app) via Vercel. Production is actively used for live testing
  by the product owner. **Never commit unreviewed work directly to `main`.**
- **Feature branches** are named `sprint-N` (e.g. `sprint-2`) or `fix/<slug>`
  and are branched off `main`.
- Vercel creates a **preview deployment for every pushed branch** — use the
  preview URL for phone-testing before any merge.
- **Merges to `main`** happen only after review by the orchestrator (Fable)
  **and** product-owner approval.

## Commit checkpoints

- One commit per completed fix or feature.
- Descriptive commit messages (what changed and why, from the user's view).
- Every commit must leave the repo building.

### Verifying a commit locally

The build **does** run to completion locally, with *dummy* env vars. This
rule previously said a local build always dies at "Collecting page data" with
a Firebase `auth/invalid-api-key` and that `✓ Compiled successfully` was the
most you could check. That is only true when the env vars are absent
entirely — Firebase validates the API key's *shape*, not its authenticity,
and makes no network call at import time.

Create a gitignored `.env.local` with syntactically valid dummy values:

```
ANTHROPIC_API_KEY=sk-ant-dummy
NEXT_PUBLIC_GOOGLE_CLIENT_ID=000.apps.googleusercontent.com
NEXT_PUBLIC_FIREBASE_API_KEY=AIzaSyDUMMYDUMMYDUMMYDUMMYDUMMYDUMMY00
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=dummy.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=dummy
NEXT_PUBLIC_FIREBASE_APP_ID=1:000000000000:web:dummy
```

Then `npm run build` static-prerenders **all 9 routes**, so every page's
render path executes — catching null-derefs in JSX, bad hook order and broken
imports — and prints a First Load JS budget per route to compare against.
Check for `✓ Generating static pages (9/9)`, not just `✓ Compiled
successfully`.

Four tiers of verification, in increasing cost:

1. **Tailwind compiles standalone** (seconds, zero env):
   `npx @tailwindcss/cli -i styles/tailwind.css -o /tmp/bx.css`
2. **`npm run verify`** — token-parity, utility-exists and frozen-strings
   gates (see `CLAUDE.md` → Commands). Catches the silent failures a green
   build does not.
3. **`npm run build`** with the dummy `.env.local`, above.
4. **Vercel preview with real keys** — the only way to verify sign-in
   (Google *and* phone/OTP), the full capture→Drive round trip, the
   nav→capture photo hand-off, swipe-to-act on a real touchscreen, all three
   `DriveFallback` states, `BiometricGate` on a Face ID device, and dark mode
   on a real phone. **Mandatory before any merge to `main`.**

There is no test suite and no typechecking (plain JS), and `next lint` is not
usable — no ESLint config exists and it would prompt to create one
interactively.

## Resume rule (interrupted work)

Any agent that is interrupted or stops before completing its task must do
one of the following before ending:

1. **Commit finished work** (on its feature branch), or
2. **Create/update `RESUME.md`** at the repo root, stating:
   - what was completed,
   - which files were touched,
   - what remains to be done,
   - the exact next step,
   - any warnings the next agent needs.

## Do-not-touch

- `chrome-extension/` is parked Phase-2 work — never modify it.
- `UI UX/` at repo root contains the product owner's design mockups —
  leave it untracked and unmodified.
