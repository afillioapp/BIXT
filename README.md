# BX

Snap a receipt, Claude reads the vendor, total, HST and date, and it's saved to
your own Google Drive, with your accountant given access automatically. No
database: Drive is the data store.

The repo and folder still say BIXT and expense-tracker for historical reasons.
See `CLAUDE.md` for how the code is put together.

## What ends up in Drive

```
BX - {Company}/
  {Fiscal year}/                <- the year the fiscal year starts in
    {Company} {Year}            <- Google Sheet: Overview, then a tab per month
    Supporting Documents/
      {Month}/                  <- compressed receipt photos
  Old monthly sheets/           <- backup of the earlier month-by-month files
```

Folders and sheets are created the first time they're needed. Businesses that
started on monthly files move across from Settings.

## Run it

```
npm run dev     # local dev server
npm run build   # production build
```

`npm run build` fails at "Collecting page data" without real Firebase keys. That's
expected; "Compiled successfully" is the line to check.

## Environment variables

Set in Vercel. No `.env.local` is kept in this repo.

| Name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | Anthropic key, used server-side by `pages/api/extract.js` |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase web config |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase web config |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | Firebase web config |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase web config |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | Google OAuth client ID |

The Google Cloud project needs the Drive API and Sheets API enabled. The app asks
only for the `drive.file` scope, which covers the files it creates.

## Deploying

Every push to `main` deploys to production at `bixt.vercel.app`. See
`docs/REPO-WORKFLOW.md`.

## Categories

Categories are the CRA's GIFI names, listed in `GIFI_CATEGORIES` in
`lib/categories.js`. Add to that list rather than renaming: the names are written
into users' sheets.
