# Expense Tracker

Snap a receipt → AI extracts date/place/total/HST/category → saved to Google Drive
(`Business Expenses / YYYY-MM / Photos` + `Business Expenses / YYYY-MM / Table` as a Google Sheet).

## 1. Deploy (same flow as Afillio/FBC)

1. Push this folder to a new GitHub repo (GitHub Desktop, like your other projects).
2. Import it into Vercel → New Project → select the repo.
3. Don't deploy yet — add environment variables first (step 3 below).

## 2. Google Cloud setup (~15 min, one time)

1. Go to https://console.cloud.google.com → create a new project (e.g. "Expense Tracker").
2. **Enable APIs**: search and enable both:
   - Google Drive API
   - Google Sheets API
3. **OAuth consent screen**: APIs & Services → OAuth consent screen.
   - User type: External (fine even for personal use).
   - Fill app name, your email. Add scopes: `drive.file` and `spreadsheets`.
   - Add yourself as a test user.
4. **Create credentials**: APIs & Services → Credentials → Create Credentials → OAuth client ID.
   - Application type: **Web application**.
   - Authorized JavaScript origins: add your Vercel URL, e.g. `https://expense-tracker-yourname.vercel.app`
     (you'll get this URL after the first Vercel deploy — you can add it after and redeploy).
   - Copy the **Client ID** it gives you.
5. **Anthropic API key**: https://console.anthropic.com → API Keys → create one.

## 3. Environment variables in Vercel

Project Settings → Environment Variables, add:

| Name | Value |
|---|---|
| `ANTHROPIC_API_KEY` | your Anthropic key |
| `NEXT_PUBLIC_GOOGLE_CLIENT_ID` | your Google OAuth client ID |

Redeploy after adding these.

## 4. First use

1. Open the app on your phone (add to home screen for app-like feel).
2. Tap "Connect Google Drive" → sign in → allow.
3. Tap "Take / Upload Receipt Photo" → snap it.
4. Review the AI's guess (date, place, total, HST, category) → edit anything wrong.
5. Tap "Save to Drive". Done — check your Drive for the `Business Expenses` folder.

## How the Drive structure works

```
Business Expenses/
  2026-07/
    Photos/        <- receipt images
    Table/
      Expenses - 2026-07   <- Google Sheet, one row per receipt
```

A new month folder + sheet is created automatically the first time you save a receipt in that month.

## Notes / next steps

- Categories are a fixed list in `pages/api/extract.js` (`CATEGORIES` array) — edit that list to match how you file expenses for taxes.
- The app currently supports one Google account per session (yours). No login system needed since it's just for you.
- If you want multi-currency handling, exchange rates, or a running monthly total on the app itself (not just the sheet), that's a quick add-on later.
