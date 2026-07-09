// Thin wrappers around Google Drive v3 and Sheets v4 REST APIs.
// All calls use the access token obtained client-side via Google Identity Services.

const DRIVE_BASE = "https://www.googleapis.com/drive/v3";
const UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

async function driveFetch(token, url, options = {}) {
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

// Looks up a child of parentId (or Drive root if null) by name + mimeType. Read-only — returns null if missing.
async function findChild(token, name, parentId, mimeType) {
  const parentClause = parentId ? `and '${parentId}' in parents` : "and 'root' in parents";
  const q = encodeURIComponent(
    `mimeType='${mimeType}' and name='${name.replace(/'/g, "\\'")}' and trashed=false ${parentClause}`
  );
  const list = await driveFetch(token, `${DRIVE_BASE}/files?q=${q}&fields=files(id,name)`);
  return list.files && list.files.length > 0 ? list.files[0].id : null;
}

// Finds a folder by name under a given parent (or root if parentId is null). Read-only, never creates.
export async function findFolderId(token, name, parentId) {
  return findChild(token, name, parentId, "application/vnd.google-apps.folder");
}

// Finds a folder by name under a given parent (or root if parentId is null). Creates it if missing.
export async function findOrCreateFolder(token, name, parentId) {
  const existing = await findFolderId(token, name, parentId);
  if (existing) return existing;
  const metadata = {
    name,
    mimeType: "application/vnd.google-apps.folder",
    parents: parentId ? [parentId] : undefined,
  };
  const created = await driveFetch(token, `${DRIVE_BASE}/files?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metadata),
  });
  return created.id;
}

// Finds a Google Sheet by name in a folder. Read-only, never creates.
export async function findSheetId(token, name, parentId) {
  return findChild(token, name, parentId, "application/vnd.google-apps.spreadsheet");
}

async function getFirstGridId(token, spreadsheetId) {
  const meta = await driveFetch(
    token,
    `${SHEETS_BASE}/${spreadsheetId}?fields=sheets(properties(sheetId))`
  );
  return meta.sheets?.[0]?.properties?.sheetId ?? 0;
}

// Bold + frozen header row, date format on column A, currency on Total/HST —
// so the accountant opens something that looks like books, not raw numbers.
async function formatExpenseSheet(token, spreadsheetId, gridId) {
  await driveFetch(token, `${SHEETS_BASE}/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      requests: [
        {
          repeatCell: {
            range: { sheetId: gridId, startRowIndex: 0, endRowIndex: 1 },
            cell: { userEnteredFormat: { textFormat: { bold: true } } },
            fields: "userEnteredFormat.textFormat.bold",
          },
        },
        {
          updateSheetProperties: {
            properties: { sheetId: gridId, gridProperties: { frozenRowCount: 1 } },
            fields: "gridProperties.frozenRowCount",
          },
        },
        {
          repeatCell: {
            range: { sheetId: gridId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 },
            cell: { userEnteredFormat: { numberFormat: { type: "DATE", pattern: "yyyy-mm-dd" } } },
            fields: "userEnteredFormat.numberFormat",
          },
        },
        {
          repeatCell: {
            range: { sheetId: gridId, startRowIndex: 1, startColumnIndex: 2, endColumnIndex: 4 },
            cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: "$#,##0.00" } } },
            fields: "userEnteredFormat.numberFormat",
          },
        },
      ],
    }),
  });
}

// Guarantees the title row exists and the sheet is formatted. Sheets can be
// left headerless when creation is interrupted mid-way (seen live: the
// spreadsheet file was created, then the header write failed because the
// Sheets API was disabled) — so this inserts the header above any existing
// data rather than assuming create-time setup succeeded.
async function ensureHeaderRow(token, spreadsheetId, headerRow) {
  const data = await driveFetch(token, `${SHEETS_BASE}/${spreadsheetId}/values/A1:E1`);
  const firstRow = (data.values && data.values[0]) || [];
  if (firstRow[0] === headerRow[0]) return;

  const gridId = await getFirstGridId(token, spreadsheetId);
  if (firstRow.length > 0) {
    await driveFetch(token, `${SHEETS_BASE}/${spreadsheetId}:batchUpdate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        requests: [
          {
            insertDimension: {
              range: { sheetId: gridId, dimension: "ROWS", startIndex: 0, endIndex: 1 },
            },
          },
        ],
      }),
    });
  }
  await driveFetch(
    token,
    `${SHEETS_BASE}/${spreadsheetId}/values/A1:E1?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values: [headerRow] }),
    }
  );
  await formatExpenseSheet(token, spreadsheetId, gridId);
}

// Finds a Google Sheet by name in a folder, or creates it with a formatted
// header row. Existing sheets are checked (and repaired) on every lookup.
export async function findOrCreateSheet(token, name, parentId, headerRow) {
  const existing = await findSheetId(token, name, parentId);
  if (existing) {
    await ensureHeaderRow(token, existing, headerRow);
    return existing;
  }

  const metadata = {
    name,
    mimeType: "application/vnd.google-apps.spreadsheet",
    parents: [parentId],
  };
  const created = await driveFetch(token, `${DRIVE_BASE}/files?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metadata),
  });

  // Add header row
  await driveFetch(
    token,
    `${SHEETS_BASE}/${created.id}/values/A1:append?valueInputOption=RAW`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values: [headerRow] }),
    }
  );
  await formatExpenseSheet(token, created.id, await getFirstGridId(token, created.id));

  return created.id;
}

// Reads all data rows (skips the header) from a sheet. Maps the 5 BX columns by position.
export async function listExpenseRows(token, spreadsheetId) {
  const data = await driveFetch(token, `${SHEETS_BASE}/${spreadsheetId}/values/A2:E`);
  const rows = data.values || [];
  return rows
    .filter((r) => r.length > 0)
    .map((r) => ({
      date: r[0] || "",
      place: r[1] || "",
      total: r[2] || "",
      hst: r[3] || "",
      receiptLink: r[4] || "",
    }));
}

// Prevents a receipt-extracted string like "=cmd|..." from being interpreted
// as a formula by Sheets — prefixing with an apostrophe forces text mode.
function sanitizeSheetText(v) {
  const trimmed = String(v ?? "").trim();
  if (/^[=+@]/.test(trimmed)) return `'${trimmed}`;
  return trimmed;
}

// Strips currency symbols/commas/spaces so "$1,234.56" stores as a real
// number; falls back to the sanitized original if it isn't actually numeric.
function cleanAmount(v) {
  const cleaned = String(v ?? "")
    .trim()
    .replace(/[$,\s]/g, "");
  return Number.isFinite(parseFloat(cleaned)) && cleaned !== "" ? cleaned : sanitizeSheetText(v);
}

export async function appendExpenseRow(token, spreadsheetId, rowValues) {
  return driveFetch(
    token,
    `${SHEETS_BASE}/${spreadsheetId}/values/A1:append?valueInputOption=USER_ENTERED`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values: [rowValues] }),
    }
  );
}

// Uploads a base64 image into a folder using multipart upload.
export async function uploadImageToFolder(token, folderId, filename, base64Data, mimeType) {
  const boundary = "expense_tracker_boundary_" + Date.now();
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

  const res = await fetch(`${UPLOAD_BASE}/files?uploadType=multipart&fields=id,webViewLink`, {
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

// Returns the ID of "BX - {companyName}" at the top of the user's Drive (creates it if missing).
// Used by the setup form, where the company name is already known.
export async function getCompanyRootFolderId(token, companyName) {
  return findOrCreateFolder(token, `BX - ${companyName}`, null);
}

// Locates the user's existing "BX - ..." root folder without knowing the
// company name up front — used on every return visit, since the profile
// (which holds the company name) lives on that very folder. Single-company
// per account, so the first match wins.
export async function findExistingCompanyRootFolder(token) {
  const q = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and trashed=false and 'root' in parents and name contains 'BX - '`
  );
  const list = await driveFetch(token, `${DRIVE_BASE}/files?q=${q}&fields=files(id,name)`);
  return list.files && list.files.length > 0 ? list.files[0].id : null;
}

// Returns the email address of the Google account this token actually
// belongs to — which is not necessarily the account the user signed in with
// (Firebase identity and the Drive grant are separate).
export async function getDriveAccountEmail(token) {
  const data = await driveFetch(token, `${DRIVE_BASE}/about?fields=user`);
  return data.user?.emailAddress || null;
}

// Shares a file/folder with an email address.
// role: "reader" | "commenter" | "writer"
export async function shareWithEmail(token, fileId, email, role = "reader") {
  await driveFetch(token, `${DRIVE_BASE}/files/${fileId}/permissions?sendNotificationEmail=true`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ role, type: "user", emailAddress: email }),
  });
}

// Lists current permission emails on a file/folder (excludes owner).
export async function listSharedEmails(token, fileId) {
  const data = await driveFetch(
    token,
    `${DRIVE_BASE}/files/${fileId}/permissions?fields=permissions(id,emailAddress,role,type)`
  );
  return (data.permissions || []).filter(
    (p) => p.type === "user" && p.role !== "owner"
  );
}

// Removes a permission from a file/folder.
export async function removeSharedEmail(token, fileId, permissionId) {
  const res = await fetch(`${DRIVE_BASE}/files/${fileId}/permissions/${permissionId}`, {
    method: "DELETE",
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 204) {
    const body = await res.text();
    throw new Error(`Remove permission failed (${res.status}): ${body}`);
  }
}

// The profile is stored as custom properties on the company root folder
// itself, so no extra visible file clutters the user's Drive.
const PROFILE_KEYS = ["companyName", "accountantEmail"];

// Returns the saved profile, or null if setup hasn't been completed yet.
export async function getProfile(token, rootFolderId) {
  const data = await driveFetch(token, `${DRIVE_BASE}/files/${rootFolderId}?fields=properties`);
  const props = data.properties || {};
  if (!props.companyName) return null;
  const profile = {};
  for (const key of PROFILE_KEYS) profile[key] = props[key] || "";
  return profile;
}

export async function saveProfile(token, rootFolderId, profile) {
  const properties = {};
  for (const key of PROFILE_KEYS) properties[key] = profile[key] || "";
  await driveFetch(token, `${DRIVE_BASE}/files/${rootFolderId}?fields=id`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ properties }),
  });
}

const EXPENSE_SHEET_HEADER = ["Date", "Place", "Total", "HST", "Receipt Link"];
const SUPPORTING_DOCS = "Supporting Documents";
const EXPENSES_SHEET = "Expenses";

function yearMonthName(date) {
  return {
    year: String(date.getFullYear()),
    monthName: date.toLocaleString("en-US", { month: "long" }),
  };
}

// Ensures {root}/{Year}/{MonthName}/Supporting Documents + Expenses sheet exist. Creates as needed.
export async function ensureMonthFolders(token, rootId, date) {
  const { year, monthName } = yearMonthName(date);
  const yearId = await findOrCreateFolder(token, year, rootId);
  const monthId = await findOrCreateFolder(token, monthName, yearId);
  const docsId = await findOrCreateFolder(token, SUPPORTING_DOCS, monthId);
  const sheetId = await findOrCreateSheet(token, EXPENSES_SHEET, monthId, EXPENSE_SHEET_HEADER);
  return { yearId, monthId, docsId, sheetId };
}

// Read-only lookup of a month's Expenses sheet — returns null at any missing
// level instead of creating anything, so browsing history has no side effects.
export async function findMonthExpenseSheetId(token, rootId, date) {
  const { year, monthName } = yearMonthName(date);
  const yearId = await findFolderId(token, year, rootId);
  if (!yearId) return null;
  const monthId = await findFolderId(token, monthName, yearId);
  if (!monthId) return null;
  return findSheetId(token, EXPENSES_SHEET, monthId);
}

// Orchestrates the full save: ensure this month's folders -> upload compressed photo -> append row.
export async function saveExpenseToDrive(token, { rootId, imageBase64, mimeType, filename, place, total, hst, date }) {
  let receiptDate = date ? new Date(`${date}T00:00:00`) : new Date();
  // Backstop: never let an unparseable date reach the folder-naming logic —
  // that's how "NaN"/"Invalid Date" folders get created on Drive.
  if (isNaN(receiptDate.getTime())) receiptDate = new Date();
  const { docsId, sheetId } = await ensureMonthFolders(token, rootId, receiptDate);

  const uploadResult = await uploadImageToFolder(token, docsId, filename, imageBase64, mimeType);
  await appendExpenseRow(token, sheetId, [
    date || "",
    sanitizeSheetText(place),
    cleanAmount(total),
    cleanAmount(hst),
    uploadResult.webViewLink || "",
  ]);

  return { photoLink: uploadResult.webViewLink, sheetId };
}
