# BX Receipt Capture (Chrome extension)

Capture an online purchase receipt straight from the browser: press
`Ctrl+Shift+B` (`Cmd+Shift+B` on Mac), drag-select the receipt on the page,
AI reads it, saved into the same `BX - {Company}/{Year}/{Month}/` structure
the phone app uses.

## 1. Load it for local testing

1. Go to `chrome://extensions`, turn on **Developer mode** (top right).
2. Click **Load unpacked**, select this `chrome-extension/` folder.
3. Note the **ID** Chrome assigns it (shown on the card) — you need it for
   the next step.

## 2. One-time Google Cloud setup

This extension needs its own OAuth client — it can't reuse the web app's
`NEXT_PUBLIC_GOOGLE_CLIENT_ID`, since that's a "Web application" client type
and extensions need a "Chrome Extension" client type, tied to the extension
ID from step 1.

1. Go to [Google Cloud Console](https://console.cloud.google.com) → the
   same project used for BX.
2. APIs & Services → Credentials → **Create Credentials** → **OAuth client ID**.
3. Application type: **Chrome Extension**.
4. Item ID: paste the extension ID from step 1.
5. Copy the generated Client ID.
6. Open `manifest.json` in this folder, replace
   `REPLACE_WITH_CHROME_EXTENSION_OAUTH_CLIENT_ID.apps.googleusercontent.com`
   under `oauth2.client_id` with it.
7. Back in `chrome://extensions`, click the reload icon on the BX card to
   pick up the manifest change.

The scopes (`drive.file`, `spreadsheets`) are the same ones the phone app
uses — no separate consent screen configuration needed beyond what already
exists for the BX Google Cloud project.

## 3. Connect and test

1. Click the BX icon in the toolbar → **Connect Google Drive** → pick your
   account.
2. If you've already set up BX on your phone, it'll find the existing
   `BX - {Company}` folder automatically. If not, it'll ask for Company
   Name + Accountant's Gmail right there in the popup.
3. On any page with a receipt/order confirmation visible, press
   `Ctrl+Shift+B` (`Cmd+Shift+B` on Mac), or use the popup's **Capture Now**
   button.
4. Drag-select the receipt area, review the extracted fields, confirm.
5. Check the phone app's History tab (or Drive directly) — the entry
   should show up alongside phone-captured receipts in the same month
   folder.

## Notes for later — Chrome Web Store submission

This is built to MV3 permission-minimal standards (`activeTab` + `scripting`
instead of a blanket host permission), which should help review, but a few
things still need doing before submitting:

- **Store listing assets**: promotional images, a longer description,
  screenshots of the capture flow.
- **Privacy policy page**: a hosted URL describing what data is
  collected/sent (the receipt image, to Anthropic's API for reading and to
  your own Google Drive for storage) — required for the listing.
- **Google OAuth verification**: `drive.file` and `spreadsheets` are
  "sensitive" scopes. Once this extension is publicly listed (not just
  side-loaded), Google requires an OAuth consent screen verification review
  for apps requesting sensitive scopes — this is separate from the Chrome
  Web Store's own review and can take longer (sometimes several weeks).
  Budget for this before counting on a public launch date.
