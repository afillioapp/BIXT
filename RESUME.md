# RESUME — current project state

_Last updated: 2026-07-09_

## Status

Sprint 1 (18-finding audit remediation, items 1-6 + several live-test fixes)
is **complete, merged on `main`, deployed, and verified live** by the product
owner on 2026-07-07 (sign-in, Drive connect, receipt save to Sheets all
confirmed working).

## Next

Sprint 2 on branch **`sprint-2`** — remaining audit items:

- **#7** date validation
- **#9** sheet formula-injection guard
- **#10** accountant email validation + confirmation
- **#8** rename-proof root-folder lookup via `appProperties` marker
- **#11** duplicate folder/sheet dedupe

Implementation specs live in the orchestrator session; **each fix = one
commit** (see `docs/REPO-WORKFLOW.md`).

## Warnings

- Pushes to `main` deploy **instantly** to production (bixt.vercel.app).
- `chrome-extension/` is parked and calls `/api/extract` without auth
  (will 401) — known, Phase 2 concern. Do not touch it.
