// Ported from expense-tracker/lib/google.js — kept in sync manually since
// the extension has no build step to share code with the Next.js app.
// Plain functions (no import/export) so this can be loaded as a classic
// script both via chrome.scripting.executeScript (content script context)
// and via a <script> tag in popup.html.

const BX_DRIVE_BASE = "https://www.googleapis.com/drive/v3";
const BX_UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
const BX_SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

async function bxDriveFetch(token, url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${token}`,
      ...(options.headers || {}),
    },
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Google API error (${res.status}): ${body}`);
  }
  return res.json();
}

async function bxFindChild(token, name, parentId, mimeType) {
  const parentClause = parentId ? `and '${parentId}' in parents` : "and 'root' in parents";
  const q = encodeURIComponent(
    `mimeType='${mimeType}' and name='${name.replace(/'/g, "\\'")}' and trashed=false ${parentClause}`
  );
  const list = await bxDriveFetch(token, `${BX_DRIVE_BASE}/files?q=${q}&fields=files(id,name)`);
  return list.files && list.files.length > 0 ? list.files[0].id : null;
}

async function bxFindFolderId(token, name, parentId) {
  return bxFindChild(token, name, parentId, "application/vnd.google-apps.folder");
}

async function bxFindOrCreateFolder(token, name, parentId) {
  const existing = await bxFindFolderId(token, name, parentId);
  if (existing) return existing;
  const metadata = {
    name,
    mimeType: "application/vnd.google-apps.folder",
    parents: parentId ? [parentId] : undefined,
  };
  const created = await bxDriveFetch(token, `${BX_DRIVE_BASE}/files?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metadata),
  });
  return created.id;
}

async function bxFindSheetId(token, name, parentId) {
  return bxFindChild(token, name, parentId, "application/vnd.google-apps.spreadsheet");
}

async function bxFindOrCreateSheet(token, name, parentId, headerRow) {
  const existing = await bxFindSheetId(token, name, parentId);
  if (existing) return existing;

  const metadata = {
    name,
    mimeType: "application/vnd.google-apps.spreadsheet",
    parents: [parentId],
  };
  const created = await bxDriveFetch(token, `${BX_DRIVE_BASE}/files?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metadata),
  });

  await bxDriveFetch(token, `${BX_SHEETS_BASE}/${created.id}/values/A1:append?valueInputOption=RAW`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values: [headerRow] }),
  });

  return created.id;
}

async function bxAppendExpenseRow(token, spreadsheetId, rowValues) {
  return bxDriveFetch(token, `${BX_SHEETS_BASE}/${spreadsheetId}/values/A1:append?valueInputOption=USER_ENTERED`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ values: [rowValues] }),
  });
}

async function bxUploadImageToFolder(token, folderId, filename, base64Data, mimeType) {
  const boundary = "bx_extension_boundary_" + Date.now();
  const metadata = { name: filename, parents: [folderId] };

  const body =
    `--${boundary}\r\n` +
    `Content-Type: application/json; charset=UTF-8\r\n\r\n` +
    `${JSON.stringify(metadata)}\r\n` +
    `--${boundary}\r\n` +
    `Content-Type: ${mimeType}\r\n` +
    `Content-Transfer-Encoding: base64\r\n\r\n` +
    `${base64Data}\r\n` +
    `--${boundary}--`;

  const res = await fetch(`${BX_UPLOAD_BASE}/files?uploadType=multipart&fields=id,webViewLink`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": `multipart/related; boundary=${boundary}`,
    },
    body,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Upload failed (${res.status}): ${text}`);
  }
  return res.json();
}

// Creates (or finds) "BX - {companyName}" at the top of Drive. Used only
// during first-time connect, where the company name is already known.
async function bxGetCompanyRootFolderId(token, companyName) {
  return bxFindOrCreateFolder(token, `BX - ${companyName}`, null);
}

// Locates the existing "BX - ..." root folder without knowing the company
// name up front — same single-company-per-account assumption as the phone app.
async function bxFindExistingCompanyRootFolder(token) {
  const q = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and trashed=false and 'root' in parents and name contains 'BX - '`
  );
  const list = await bxDriveFetch(token, `${BX_DRIVE_BASE}/files?q=${q}&fields=files(id,name)`);
  return list.files && list.files.length > 0 ? list.files[0].id : null;
}

async function bxShareWithEmail(token, fileId, email, role = "reader") {
  await bxDriveFetch(token, `${BX_DRIVE_BASE}/files/${fileId}/permissions?sendNotificationEmail=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, type: "user", emailAddress: email }),
  });
}

const BX_PROFILE_KEYS = ["companyName", "accountantEmail"];

async function bxGetProfile(token, rootFolderId) {
  const data = await bxDriveFetch(token, `${BX_DRIVE_BASE}/files/${rootFolderId}?fields=properties`);
  const props = data.properties || {};
  if (!props.companyName) return null;
  const profile = {};
  for (const key of BX_PROFILE_KEYS) profile[key] = props[key] || "";
  return profile;
}

async function bxSaveProfile(token, rootFolderId, profile) {
  const properties = {};
  for (const key of BX_PROFILE_KEYS) properties[key] = profile[key] || "";
  await bxDriveFetch(token, `${BX_DRIVE_BASE}/files/${rootFolderId}?fields=id`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ properties }),
  });
}

const BX_EXPENSE_SHEET_HEADER = ["Date", "Place", "Total", "HST", "Receipt Link"];
const BX_SUPPORTING_DOCS = "Supporting Documents";
const BX_EXPENSES_SHEET = "Expenses";

function bxYearMonthName(date) {
  return {
    year: String(date.getFullYear()),
    monthName: date.toLocaleString("en-US", { month: "long" }),
  };
}

async function bxEnsureMonthFolders(token, rootId, date) {
  const { year, monthName } = bxYearMonthName(date);
  const yearId = await bxFindOrCreateFolder(token, year, rootId);
  const monthId = await bxFindOrCreateFolder(token, monthName, yearId);
  const docsId = await bxFindOrCreateFolder(token, BX_SUPPORTING_DOCS, monthId);
  const sheetId = await bxFindOrCreateSheet(token, BX_EXPENSES_SHEET, monthId, BX_EXPENSE_SHEET_HEADER);
  return { yearId, monthId, docsId, sheetId };
}

// Orchestrates the full save: ensure this month's folders -> upload compressed photo -> append row.
// Mirrors saveExpenseToDrive in lib/google.js exactly, so captures interleave
// correctly with phone-app captures in the same sheet/folder structure.
async function bxSaveExpenseToDrive(token, { rootId, imageBase64, mimeType, filename, place, total, hst, date }) {
  const receiptDate = date ? new Date(`${date}T00:00:00`) : new Date();
  const { docsId, sheetId } = await bxEnsureMonthFolders(token, rootId, receiptDate);

  const uploadResult = await bxUploadImageToFolder(token, docsId, filename, imageBase64, mimeType);
  await bxAppendExpenseRow(token, sheetId, [date || "", place || "", total || "", hst || "", uploadResult.webViewLink || ""]);

  return { photoLink: uploadResult.webViewLink, sheetId };
}
