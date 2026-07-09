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
- Every commit must leave the repo building: `npm run build` must print
  `✓ Compiled successfully`. (A later "Failed to collect page data" /
  Firebase `auth/invalid-api-key` error is expected locally — env keys live
  only in Vercel — and is not a failure.)

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
