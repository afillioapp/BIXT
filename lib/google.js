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
// Ordered oldest-first so every device deterministically picks the same file
// when duplicates exist.
async function findChild(token, name, parentId, mimeType) {
  const parentClause = parentId ? `and '${parentId}' in parents` : "and 'root' in parents";
  const q = encodeURIComponent(
    `mimeType='${mimeType}' and name='${name.replace(/'/g, "\\'")}' and trashed=false ${parentClause}`
  );
  const list = await driveFetch(
    token,
    `${DRIVE_BASE}/files?q=${q}&fields=files(id,name)&orderBy=createdTime`
  );
  return list.files && list.files.length > 0 ? list.files[0].id : null;
}

// Finds a folder by name under a given parent (or root if parentId is null). Read-only, never creates.
export async function findFolderId(token, name, parentId) {
  return findChild(token, name, parentId, "application/vnd.google-apps.folder");
}

// After a create, re-run the (oldest-first) find. If it returns a different
// id, a concurrent call won the race: delete the file created by THIS call —
// it's empty and ours — and use the older one. If the delete fails we still
// return the older id; the duplicate is harmless clutter, not forked data.
async function collapseRaceDuplicate(token, createdId, refind) {
  const oldest = await refind();
  if (!oldest || oldest === createdId) return createdId;
  try {
    await fetch(`${DRIVE_BASE}/files/${createdId}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${token}` },
    });
  } catch {
    // Ignore — the older id is still the canonical one.
  }
  return oldest;
}

// Finds a folder by name under a given parent (or root if parentId is null). Creates it if missing.
// Optional appProperties are stamped onto the folder at creation time (hidden, app-only metadata).
export async function findOrCreateFolder(token, name, parentId, appProperties) {
  const existing = await findFolderId(token, name, parentId);
  if (existing) return existing;
  const metadata = {
    name,
    mimeType: "application/vnd.google-apps.folder",
    parents: parentId ? [parentId] : undefined,
    ...(appProperties ? { appProperties } : {}),
  };
  const created = await driveFetch(token, `${DRIVE_BASE}/files?fields=id`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(metadata),
  });
  return collapseRaceDuplicate(token, created.id, () => findFolderId(token, name, parentId));
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
            // Total + HST — columns D and E in the v2 layout.
            range: { sheetId: gridId, startRowIndex: 1, startColumnIndex: 3, endColumnIndex: 5 },
            cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: "$#,##0.00" } } },
            fields: "userEnteredFormat.numberFormat",
          },
        },
      ],
    }),
  });
}

async function sheetsBatchUpdate(token, spreadsheetId, requests) {
  await driveFetch(token, `${SHEETS_BASE}/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ requests }),
  });
}

async function putValues(token, spreadsheetId, range, values) {
  await driveFetch(
    token,
    `${SHEETS_BASE}/${spreadsheetId}/values/${range}?valueInputOption=RAW`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
    }
  );
}

// Same as putValues but USER_ENTERED (matches appendExpenseRow) — used for
// row edits so Sheets parses dates/numbers the same way a manual edit would.
async function putValuesUserEntered(token, spreadsheetId, range, values) {
  await driveFetch(
    token,
    `${SHEETS_BASE}/${spreadsheetId}/values/${range}?valueInputOption=USER_ENTERED`,
    {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ values }),
    }
  );
}

// Guarantees the title row exists, the sheet is formatted, and the columns
// follow the v2 layout. Handles every layout seen in the wild:
//   - headerless (creation interrupted mid-way — seen live once)
//   - v1: Date | Place | Total | HST | Receipt Link [| Category]
//   - v2: Date | Vendor | Category | Total | HST | Receipt Link (target)
// v1 sheets are migrated IN PLACE: a new Category column is inserted after
// the vendor column, an existing trailing Category column's values are moved
// into it, and the header is rewritten — existing data rows keep their values.
async function ensureHeaderRow(token, spreadsheetId, headerRow) {
  const data = await driveFetch(token, `${SHEETS_BASE}/${spreadsheetId}/values/A1:G1`);
  let firstRow = (data.values && data.values[0]) || [];

  // Already v2? Done.
  if (firstRow[0] === "Date" && firstRow[1] === headerRow[1] && firstRow[2] === headerRow[2]) {
    return;
  }

  const gridId = await getFirstGridId(token, spreadsheetId);

  // Headerless sheet with data: its rows are in the v1 order (headerless
  // sheets predate v2), so insert a v1 header first and let the migration
  // below carry it the rest of the way.
  if (firstRow.length > 0 && firstRow[0] !== "Date") {
    await sheetsBatchUpdate(token, spreadsheetId, [
      { insertDimension: { range: { sheetId: gridId, dimension: "ROWS", startIndex: 0, endIndex: 1 } } },
    ]);
    firstRow = ["Date", "Place", "Total", "HST", "Receipt Link"];
    await putValues(token, spreadsheetId, "A1:E1", [firstRow]);
  }

  // v1 → v2 migration.
  if (firstRow[0] === "Date" && firstRow[1] === "Place") {
    const hadTrailingCategory = firstRow[5] === "Category";
    // 1. New empty column C (everything from old Total rightward shifts one).
    await sheetsBatchUpdate(token, spreadsheetId, [
      { insertDimension: { range: { sheetId: gridId, dimension: "COLUMNS", startIndex: 2, endIndex: 3 } } },
    ]);
    // 2. Old trailing Category (now column G) moves into the new C.
    if (hadTrailingCategory) {
      const catData = await driveFetch(token, `${SHEETS_BASE}/${spreadsheetId}/values/G2:G`);
      const catValues = catData.values || [];
      if (catValues.length > 0) {
        await putValues(token, spreadsheetId, `C2:C${catValues.length + 1}`, catValues);
      }
      await sheetsBatchUpdate(token, spreadsheetId, [
        { deleteDimension: { range: { sheetId: gridId, dimension: "COLUMNS", startIndex: 6, endIndex: 7 } } },
      ]);
    }
    // 3. The v2 header + formats (currency moved to D/E).
    await putValues(token, spreadsheetId, "A1:F1", [headerRow]);
    await formatExpenseSheet(token, spreadsheetId, gridId);
    return;
  }

  // Empty sheet: plain v2 header.
  const lastCol = String.fromCharCode("A".charCodeAt(0) + headerRow.length - 1);
  await driveFetch(
    token,
    `${SHEETS_BASE}/${spreadsheetId}/values/A1:${lastCol}1?valueInputOption=RAW`,
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

  // Collapse a concurrently created duplicate before writing anything into
  // our sheet — if an older sheet won the race, adopt (and repair) it instead.
  const winnerId = await collapseRaceDuplicate(token, created.id, () =>
    findSheetId(token, name, parentId)
  );
  if (winnerId !== created.id) {
    await ensureHeaderRow(token, winnerId, headerRow);
    return winnerId;
  }

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

// Reads all data rows (skips the header) from a sheet. Maps the 6 BX columns by position.
// Column F (Category) may be empty on rows saved before it existed — those
// render as "Other" rather than blank.
//
// Each row also carries provenance for later mutation (swipe-to-edit/delete):
// sheetId (this spreadsheet), rowIndex (1-based sheet row number), layout
// ("v1"|"v2"), and for v1 rows, hadTrailingCategory (whether this v1 sheet
// had a legacy trailing Category column in F, so an edit knows to write it
// back there too). rowIndex is computed from each row's ORIGINAL position
// (header offset: hasHeader ? idx+2 : idx+1) BEFORE the empty-row filter, so
// filtered-out blank rows never shift later rows' indices.
export async function listExpenseRows(token, spreadsheetId) {
  // Read the header too: sheets migrate to the v2 column order only when
  // they're next SAVED to, so past months can stay in the v1 order forever.
  // Detect which layout this sheet uses and map accordingly.
  const data = await driveFetch(token, `${SHEETS_BASE}/${spreadsheetId}/values/A1:G`);
  const all = data.values || [];
  if (all.length === 0) return [];

  const header = all[0] || [];
  const hasHeader = header[0] === "Date";
  const isV2 = hasHeader && header[1] === "Vendor";
  const hadTrailingCategory = hasHeader && !isV2 && header[5] === "Category";
  const rows = hasHeader ? all.slice(1) : all; // headerless sheets are v1 data

  return rows
    .map((r, idx) => ({ r, rowIndex: hasHeader ? idx + 2 : idx + 1 }))
    .filter(({ r }) => r.length > 0)
    .map(({ r, rowIndex }) =>
      isV2
        ? {
            date: r[0] || "",
            place: r[1] || "",
            category: r[2] || "Other",
            total: r[3] || "",
            hst: r[4] || "",
            receiptLink: r[5] || "",
            sheetId: spreadsheetId,
            rowIndex,
            layout: "v2",
          }
        : {
            date: r[0] || "",
            place: r[1] || "",
            total: r[2] || "",
            hst: r[3] || "",
            receiptLink: r[4] || "",
            category: r[5] || "Other",
            sheetId: spreadsheetId,
            rowIndex,
            layout: "v1",
            hadTrailingCategory,
          }
    );
}

// Deletes a single expense row from its sheet (swipe-to-delete). rowIndex is
// the 1-based sheet row number carried on the row object from
// listExpenseRows. Only the sheet row is removed — the receipt photo
// deliberately stays in Drive (callers never delete from Supporting
// Documents).
export async function deleteExpenseRow(token, spreadsheetId, rowIndex) {
  const gridId = await getFirstGridId(token, spreadsheetId);
  await sheetsBatchUpdate(token, spreadsheetId, [
    {
      deleteDimension: {
        range: {
          sheetId: gridId,
          dimension: "ROWS",
          startIndex: rowIndex - 1,
          endIndex: rowIndex,
        },
      },
    },
  ]);
}

// Writes a full row back in place (swipe-to-edit), in the correct column
// order for that row's layout. v2 writes A:F (date, vendor, category, total,
// hst, link). v1 always writes A:E (date, place, total, hst, link); if the
// row's sheet had a legacy trailing Category column (hadTrailingCategory,
// carried by listExpenseRows), F is also written so that column stays in
// sync. Text/amounts are routed through the same sanitizers
// saveExpenseToDrive uses, and USER_ENTERED matches the append path.
export async function updateExpenseRow(
  token,
  spreadsheetId,
  rowIndex,
  layout,
  { date, place, category, total, hst, receiptLink, hadTrailingCategory }
) {
  const cleanDate = date || "";
  const cleanPlace = sanitizeSheetText(place);
  const cleanCategory = sanitizeSheetText(category || "Other");
  const cleanTotal = cleanAmount(total);
  const cleanHst = cleanAmount(hst);
  const cleanLink = receiptLink || "";

  if (layout === "v2") {
    await putValuesUserEntered(token, spreadsheetId, `A${rowIndex}:F${rowIndex}`, [
      [cleanDate, cleanPlace, cleanCategory, cleanTotal, cleanHst, cleanLink],
    ]);
    return;
  }

  await putValuesUserEntered(token, spreadsheetId, `A${rowIndex}:E${rowIndex}`, [
    [cleanDate, cleanPlace, cleanTotal, cleanHst, cleanLink],
  ]);
  if (hadTrailingCategory) {
    await putValuesUserEntered(token, spreadsheetId, `F${rowIndex}:F${rowIndex}`, [[cleanCategory]]);
  }
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

// Hidden app-scoped marker on the company root folder, so we can find it
// again even if the user renames or moves it in Drive.
const ROOT_MARKER = { bxRoot: "true" };

// Returns the ID of "BX - {companyName}" at the top of the user's Drive (creates it if missing).
// Used by the setup form, where the company name is already known.
export async function getCompanyRootFolderId(token, companyName) {
  return findOrCreateFolder(token, `BX - ${companyName}`, null, ROOT_MARKER);
}

// Locates the user's existing company root folder without knowing the
// company name up front — used on every return visit, since the profile
// (which holds the company name) lives on that very folder. Single-company
// per account, so the oldest match wins. Looks for the hidden bxRoot marker
// first (survives renames/moves); falls back to the legacy name-based query
// and self-heals by stamping the marker onto the folder it finds.
export async function findExistingCompanyRootFolder(token) {
  const markerQ = encodeURIComponent(
    `appProperties has { key='bxRoot' and value='true' } and mimeType='application/vnd.google-apps.folder' and trashed=false`
  );
  const marked = await driveFetch(
    token,
    `${DRIVE_BASE}/files?q=${markerQ}&fields=files(id,name)&orderBy=createdTime`
  );
  if (marked.files && marked.files.length > 0) return marked.files[0].id;

  const legacyQ = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and trashed=false and 'root' in parents and name contains 'BX - '`
  );
  const list = await driveFetch(
    token,
    `${DRIVE_BASE}/files?q=${legacyQ}&fields=files(id,name)&orderBy=createdTime`
  );
  if (!list.files || list.files.length === 0) return null;

  const folderId = list.files[0].id;
  // Migrate pre-marker folders in place so future lookups survive a rename.
  // Best effort: the folder was found either way, so a failed PATCH must not
  // break the sign-in path.
  try {
    await driveFetch(token, `${DRIVE_BASE}/files/${folderId}?fields=id`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ appProperties: ROOT_MARKER }),
    });
  } catch {
    // Ignore — lookup still succeeded via the legacy query.
  }
  return folderId;
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

// Sheet layout v2 (owner request 2026-07-10): Category sits beside Vendor,
// and "Place" is renamed "Vendor" (the accounting term). ensureHeaderRow
// migrates v1 sheets (Date|Place|Total|HST|Receipt Link[|Category]) in place.
const EXPENSE_SHEET_HEADER = ["Date", "Vendor", "Category", "Total", "HST", "Receipt Link"];
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
export async function saveExpenseToDrive(token, { rootId, imageBase64, mimeType, filename, place, total, hst, date, category }) {
  let receiptDate = date ? new Date(`${date}T00:00:00`) : new Date();
  // Backstop: never let an unparseable date reach the folder-naming logic —
  // that's how "NaN"/"Invalid Date" folders get created on Drive.
  if (isNaN(receiptDate.getTime())) receiptDate = new Date();
  const { docsId, sheetId } = await ensureMonthFolders(token, rootId, receiptDate);

  const uploadResult = await uploadImageToFolder(token, docsId, filename, imageBase64, mimeType);
  await appendExpenseRow(token, sheetId, [
    date || "",
    sanitizeSheetText(place),
    sanitizeSheetText(category || "Other"),
    cleanAmount(total),
    cleanAmount(hst),
    uploadResult.webViewLink || "",
  ]);

  return { photoLink: uploadResult.webViewLink, sheetId };
}
