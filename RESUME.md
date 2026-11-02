# RESUME — current project state

_Last updated: 2026-11-02_

## Status

Live on `main` at `d1c4e18`: duplicate warnings, Net amount, GIFI categories, the
first annual report, and a fix so columns are found by title (the owner moved Net
to column F by hand in the October 2026 sheet).

**Not live:** one file per fiscal year, on `feature/yearly-files`, uncommitted,
waiting for the owner's "make it live". It replaces the annual report: month tabs
hold the receipts, and the owner runs the move from Settings.

## Not verified yet

The yearly files and the move have only run against a fake Google
(`../.claude/tools/sheet-test/test.mjs`, 39 scenarios) and the preview harness,
never against real Drive or Sheets. The move checks each month by reading it back
before switching over, and keeps the old files. After the owner's first real move,
compare the new tabs with `Old monthly sheets` using the read-only Drive connector.

## Waiting on the owner

- **Accountant review of the GIFI mapping.** These are judgement calls, in
  `LEGACY_CATEGORIES` in `lib/categories.js`: Dining and Coffee to 8523, Fuel to
  9281, Groceries to 9135, Travel, Ground Transport and Accommodation to 9200, and
  Rent & Utilities split by vendor. All income reports under 8000.
- **OCR switch-over.** On `feature/local-ocr`, blocked until the owner creates the
  Vercel OCR project and its environment variables. When it ships, its
  `pages/capture.js` and `pages/api/extract.js` changes must be re-applied by hand,
  and `ocr-service/bx_ocr/categories.py` should move to the GIFI list.
- **Accountant access.** The accountant has Editor rather than Viewer on the Drive
  folder, and the owner should re-save the accountant's email in Settings.

## Known gaps

- A hand edit to a month tab reaches the Overview only at its next rebuild.
- The fiscal year start can't change once on yearly files.
- The parked Chrome extension still writes the old monthly structure.
- Insight (`pages/stats.js`) isn't linked from the menu.
