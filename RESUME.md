# RESUME — current project state

_Last updated: 2026-07-09_

## Status

Sprint 1 (18-finding audit remediation, items 1-6 + several live-test fixes)
is **complete, merged on `main`, deployed, and verified live** by the product
owner on 2026-07-07 (sign-in, Drive connect, receipt save to Sheets all
confirmed working).

Sprint 2 (audit items #7, #9, #10, #8, #11) is **implemented on branch
`sprint-2`, pushed to origin, awaiting orchestrator review + live phone
test**. One commit per fix:

- **#7** date validation — `type="date"` input, YYYY-MM-DD check in
  `handleConfirm`, Invalid-Date backstop in `saveExpenseToDrive`
  (pages/index.js, lib/google.js)
- **#9** formula-injection guard + amount normalization —
  `sanitizeSheetText` / `cleanAmount` applied to place/total/hst
  (lib/google.js)
- **#10** accountant email validation + inline confirm-before-share step
  on both onboarding and settings (pages/setup.js, pages/settings.js)
- **#8** rename-proof root-folder lookup via hidden `appProperties`
  marker `bxRoot=true`, with self-healing legacy-name fallback that
  stamps the marker onto pre-existing folders (lib/google.js)
- **#11** oldest-first (`orderBy=createdTime`) lookups + race-created
  duplicate collapse on the folder/sheet create paths (lib/google.js)

Deviations from spec (minor, documented for review):

- #11: in `findOrCreateSheet`, the duplicate check runs **before** the
  header row is written to the new sheet; when an older sheet wins the
  race, `ensureHeaderRow` is run on it before returning, so the adopted
  sheet is guaranteed a header.
- #8: the legacy-fallback PATCH that stamps the marker is wrapped in a
  try/catch — a failed migration must not break the sign-in path.
- Builds verified via `npm run build` ("Compiled successfully"); the
  app cannot run locally (env keys live in Vercel only), so live phone
  testing remains for the product owner.

## Next

- Orchestrator review of the five `sprint-2` commits.
- Live phone test (capture -> save, onboarding confirm step, settings
  accountant change, rename-the-root-folder survival).
- Merge `sprint-2` to `main` only after the live test passes.

## Warnings

- Pushes to `main` deploy **instantly** to production (bixt.vercel.app).
- `chrome-extension/` is parked and calls `/api/extract` without auth
  (will 401) — known, Phase 2 concern. Do not touch it.
