import { currencySymbol, fiscalStartMonth, fiscalYear, currencyCode } from "./insights.js";
import { CUSTOM_CATEGORY_KEYS, HIDDEN_CATEGORIES_KEY, OTHER_CATEGORY, canonicalCategory } from "./categories.js";
import { OVERVIEW_TAB, REPORT_HEADER, buildOverview, monthTabRows, reportFileName, tabTitle } from "./annualReport.js";

// Thin wrappers around Google Drive v3 and Sheets v4 REST APIs.
// All calls use the access token obtained client-side via Google Identity Services.

const DRIVE_BASE = "https://www.googleapis.com/drive/v3";
const UPLOAD_BASE = "https://www.googleapis.com/upload/drive/v3";
const SHEETS_BASE = "https://sheets.googleapis.com/v4/spreadsheets";

// Runs fn(token); if the Drive connection has expired, renews it once and
// retries. Pass-through for every other error.
export async function withFreshToken(accessToken, refreshAccessToken, fn) {
  try {
    return await fn(accessToken);
  } catch (err) {
    if (!/\(401\)/.test(err?.message || "")) throw err;
    return fn(await refreshAccessToken());
  }
}

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
// Sheets number format for Total/HST in the business's currency. "$" keeps
// the format every existing sheet already uses.
function currencyPattern(currency) {
  const symbol = currencySymbol(currency);
  const digits = currency === "JPY" ? "#,##0" : "#,##0.00";
  return symbol === "$" ? `$${digits}` : `[$${symbol}]${digits}`;
}

async function formatExpenseSheet(token, spreadsheetId, gridId, currency = "CAD") {
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
            cell: { userEnteredFormat: { numberFormat: { type: "CURRENCY", pattern: currencyPattern(currency) } } },
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

// Column G onward belongs to the owner as much as to BX: an accountant's
// notes, a "Paid by" column. BX's Type column is found by its header (any
// case, G or later) and only ever ADDED, never written over something else.
const FIRST_TYPE_INDEX = 6; // column G: BX's added columns start here

function headerIs(v, name) {
  return String(v ?? "").trim().toLowerCase() === name.toLowerCase();
}

// Index of the column titled `name` (any case, G or later), or -1.
function columnIndexOf(header, name) {
  for (let i = FIRST_TYPE_INDEX; i < (header || []).length; i++) {
    if (headerIs(header[i], name)) return i;
  }
  return -1;
}

function typeColumnIndex(header) {
  return columnIndexOf(header, TYPE_HEADER);
}

// A-E never move, but the owner can put a column of their own at F (their Net,
// 2026-11-02), so the receipt link and net are found by title from F onward.
const FIRST_MOVABLE_INDEX = 5; // column F

function movableColumnIndex(header, names) {
  for (let i = FIRST_MOVABLE_INDEX; i < (header || []).length; i++) {
    if (names.some((name) => headerIs(header[i], name))) return i;
  }
  return -1;
}

function linkColumnIndex(header) {
  const found = movableColumnIndex(header, [LINK_HEADER]);
  return found === -1 ? FIRST_MOVABLE_INDEX : found;
}

function netColumnIndex(header) {
  return movableColumnIndex(header, [NET_HEADER, NET_HEADER_SHORT]);
}

// 0 -> "A" … 25 -> "Z". Row-1 reads stop at Z, so this is all we need.
function columnLetter(index) {
  return String.fromCharCode("A".charCodeAt(0) + index);
}

async function readHeader(token, spreadsheetId) {
  const head = await driveFetch(token, `${SHEETS_BASE}/${spreadsheetId}/values/A1:Z1`);
  return (head.values && head.values[0]) || [];
}

// Adds a column titled `name` at index `at`. If that column holds anything at
// all (a header, or values under a blank header), a fresh column is inserted
// there so the owner's column moves right intact — never written over.
async function addColumn(token, spreadsheetId, name, at) {
  const letter = columnLetter(at);
  const col = await driveFetch(token, `${SHEETS_BASE}/${spreadsheetId}/values/${letter}1:${letter}`);
  const occupied = (col.values || []).some((r) => r.some((v) => String(v ?? "").trim() !== ""));
  if (occupied) {
    const gridId = await getFirstGridId(token, spreadsheetId);
    await sheetsBatchUpdate(token, spreadsheetId, [
      { insertDimension: { range: { sheetId: gridId, dimension: "COLUMNS", startIndex: at, endIndex: at + 1 } } },
    ]);
  }
  await putValues(token, spreadsheetId, `${letter}1`, [[name]]);
}

// Total minus HST, as a formula so a hand edit to either stays right. Total and
// HST are always columns D and E. A row whose amounts aren't numbers shows blank.
function netFormula(row) {
  return `=IFERROR(D${row}-E${row},"")`;
}

// Gives the Net column the same money format as HST, whichever currency that is.
function copyHstFormatRequest(gridId, netIndex) {
  return {
    copyPaste: {
      source: { sheetId: gridId, startColumnIndex: 4, endColumnIndex: 5 },
      destination: { sheetId: gridId, startColumnIndex: netIndex, endColumnIndex: netIndex + 1 },
      pasteType: "PASTE_FORMAT",
    },
  };
}

// Fills in the net amount on receipts that don't have one. Anything already in
// the column stays, including a number typed by hand.
async function fillMissingNet(token, spreadsheetId, at) {
  const letter = columnLetter(at);
  const [totals, nets] = await Promise.all([
    driveFetch(token, `${SHEETS_BASE}/${spreadsheetId}/values/D2:D`),
    driveFetch(token, `${SHEETS_BASE}/${spreadsheetId}/values/${letter}2:${letter}`),
  ]);
  const data = [];
  (totals.values || []).forEach((r, i) => {
    const hasTotal = String(r[0] ?? "").trim() !== "";
    const hasNet = String(nets.values?.[i]?.[0] ?? "").trim() !== "";
    if (hasTotal && !hasNet) data.push({ range: `${letter}${i + 2}`, values: [[netFormula(i + 2)]] });
  });
  if (!data.length) return;
  await sheetsBatchUpdate(token, spreadsheetId, [copyHstFormatRequest(await getFirstGridId(token, spreadsheetId), at)]);
  await driveFetch(token, `${SHEETS_BASE}/${spreadsheetId}/values:batchUpdate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ valueInputOption: "USER_ENTERED", data }),
  });
}

// Makes sure the sheet has BX's added columns and returns where they are: Type
// (normally G), the note for the accountant (normally H, right after Type) and
// the net amount (normally I, after the note), plus the receipt link (normally
// F). Each is found by its title and only ever added, never written over.
async function ensureBxColumns(token, spreadsheetId) {
  let header = await readHeader(token, spreadsheetId);
  let typeIndex = columnIndexOf(header, TYPE_HEADER);
  if (typeIndex === -1) {
    await addColumn(token, spreadsheetId, TYPE_HEADER, FIRST_TYPE_INDEX);
    header = await readHeader(token, spreadsheetId);
    typeIndex = columnIndexOf(header, TYPE_HEADER);
  }
  let noteIndex = columnIndexOf(header, NOTE_HEADER);
  if (noteIndex === -1) {
    await addColumn(token, spreadsheetId, NOTE_HEADER, typeIndex + 1);
    header = await readHeader(token, spreadsheetId);
    noteIndex = columnIndexOf(header, NOTE_HEADER);
  }
  let netIndex = netColumnIndex(header);
  if (netIndex === -1) {
    netIndex = noteIndex + 1;
    await addColumn(token, spreadsheetId, NET_HEADER, netIndex);
    header = await readHeader(token, spreadsheetId);
  }
  await fillMissingNet(token, spreadsheetId, netIndex);
  return { typeIndex, noteIndex, netIndex, linkIndex: linkColumnIndex(header) };
}

// Guarantees the title row exists, the sheet is formatted, and the columns
// follow the current layout, then returns where BX's added columns are
// ({ typeIndex, noteIndex, netIndex, linkIndex }). Handles
// every layout seen in the wild:
//   - headerless (creation interrupted mid-way — seen live once)
//   - v1: Date | Place | Total | HST | Receipt Link [| Category]
//   - v2: Date | Vendor | Category | Total | HST | Receipt Link
//   - v3: v2 + Type (G) + Note for accountant (H) + Net amount (I), unless the
//     owner moved them
// Only A-F are ever rewritten here; Type and the note go through
// ensureBxColumns. v1 sheets are migrated IN PLACE: a new Category column is
// inserted after the vendor column, an existing trailing Category column's
// values are moved into it, and the header is rewritten — existing data rows
// keep their values. Rows saved before Type existed read back as "Expense",
// which is what every receipt was then.
async function ensureHeaderRow(token, spreadsheetId) {
  const data = await driveFetch(token, `${SHEETS_BASE}/${spreadsheetId}/values/A1:F1`);
  let firstRow = (data.values && data.values[0]) || [];

  // Already v2: only the Type column can be missing.
  if (firstRow[0] === "Date" && firstRow[1] === V2_HEADER[1] && firstRow[2] === V2_HEADER[2]) {
    return ensureBxColumns(token, spreadsheetId);
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
    await putValues(token, spreadsheetId, "A1:F1", [V2_HEADER]);
    await formatExpenseSheet(token, spreadsheetId, gridId);
    return ensureBxColumns(token, spreadsheetId);
  }

  // Empty or unrecognised header: plain v2 header in A-F.
  await putValues(token, spreadsheetId, "A1:F1", [V2_HEADER]);
  await formatExpenseSheet(token, spreadsheetId, gridId);
  return ensureBxColumns(token, spreadsheetId);
}

// Finds a Google Sheet by name in a folder, or creates it with a formatted
// header row. Existing sheets are checked (and repaired) on every lookup.
// Returns { sheetId, typeIndex, noteIndex, netIndex, linkIndex } — where this
// sheet keeps BX's movable columns.
export async function findOrCreateSheet(token, name, parentId, headerRow, currency) {
  const existing = await findSheetId(token, name, parentId);
  if (existing) {
    return { sheetId: existing, ...(await ensureHeaderRow(token, existing)) };
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
    return { sheetId: winnerId, ...(await ensureHeaderRow(token, winnerId)) };
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
  const gridId = await getFirstGridId(token, created.id);
  await formatExpenseSheet(token, created.id, gridId, currency);
  const netIndex = netColumnIndex(headerRow);
  await sheetsBatchUpdate(token, created.id, [copyHstFormatRequest(gridId, netIndex)]);

  return { sheetId: created.id, typeIndex: typeColumnIndex(headerRow), noteIndex: columnIndexOf(headerRow, NOTE_HEADER), netIndex, linkIndex: linkColumnIndex(headerRow) };
}

// Reads all data rows (skips the header) from a sheet. Maps the BX columns by position.
// Category may be empty on rows saved before it existed — those read as "Other
// expenses" rather than blank — and names from before GIFI read as their GIFI
// successor (canonicalCategory). Type is found by its header (normally G); rows
// saved before it existed, and sheets without one, read as "Expense".
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
  const data = await driveFetch(token, `${SHEETS_BASE}/${spreadsheetId}/values/A1:Z`);
  const all = data.values || [];
  if (all.length === 0) return [];

  const header = all[0] || [];
  const hasHeader = header[0] === "Date";
  const isV2 = hasHeader && header[1] === "Vendor";
  const hadTrailingCategory = hasHeader && !isV2 && header[5] === "Category";
  const typeIndex = isV2 ? typeColumnIndex(header) : -1;
  const noteIndex = isV2 ? columnIndexOf(header, NOTE_HEADER) : -1;
  const linkIndex = isV2 ? linkColumnIndex(header) : -1;
  const rows = hasHeader ? all.slice(1) : all; // headerless sheets are v1 data

  return rows
    .map((r, idx) => ({ r, rowIndex: hasHeader ? idx + 2 : idx + 1 }))
    .filter(({ r }) => r.length > 0)
    .map(({ r, rowIndex }) =>
      isV2
        ? {
            date: r[0] || "",
            place: r[1] || "",
            category: canonicalCategory(r[2], r[1]),
            total: r[3] || "",
            hst: r[4] || "",
            receiptLink: r[linkIndex] || "",
            type: typeIndex === -1 ? ENTRY_TYPES.expense : normalizeEntryType(r[typeIndex]),
            note: noteIndex === -1 ? "" : r[noteIndex] || "",
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
            category: canonicalCategory(r[5], r[1]),
            type: ENTRY_TYPES.expense,
            note: "",
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
// order for that row's layout. v2 writes A:E (date, vendor, category, total,
// hst), then the link, type, note and net into the columns with those titles,
// adding any the sheet predates (never over the owner's own column G). The
// header row is never rewritten by an edit. v1 always writes A:E (date, place, total, hst, link); if the
// row's sheet had a legacy trailing Category column (hadTrailingCategory,
// carried by listExpenseRows), F is also written so that column stays in
// sync. Text/amounts are routed through the same sanitizers
// saveExpenseToDrive uses, and USER_ENTERED matches the append path.
export async function updateExpenseRow(
  token,
  spreadsheetId,
  rowIndex,
  layout,
  { date, place, category, total, hst, receiptLink, type, note, hadTrailingCategory }
) {
  const cleanDate = date || "";
  const cleanPlace = sanitizeSheetText(place);
  const cleanCategory = sanitizeSheetText(category || OTHER_CATEGORY);
  const cleanTotal = cleanAmount(total);
  const cleanHst = cleanAmount(hst);
  const cleanLink = receiptLink || "";

  if (layout === "v2") {
    await putValuesUserEntered(token, spreadsheetId, `A${rowIndex}:E${rowIndex}`, [
      [cleanDate, cleanPlace, cleanCategory, cleanTotal, cleanHst],
    ]);
    const { typeIndex, noteIndex, netIndex, linkIndex } = await ensureBxColumns(token, spreadsheetId);
    const linkCell = `${columnLetter(linkIndex)}${rowIndex}`;
    await putValuesUserEntered(token, spreadsheetId, `${linkCell}:${linkCell}`, [[cleanLink]]);
    const typeCell = `${columnLetter(typeIndex)}${rowIndex}`;
    await putValuesUserEntered(token, spreadsheetId, `${typeCell}:${typeCell}`, [[normalizeEntryType(type)]]);
    const noteCell = `${columnLetter(noteIndex)}${rowIndex}`;
    await putValuesUserEntered(token, spreadsheetId, `${noteCell}:${noteCell}`, [[sanitizeSheetText(note)]]);
    const netCell = `${columnLetter(netIndex)}${rowIndex}`;
    await putValuesUserEntered(token, spreadsheetId, `${netCell}:${netCell}`, [[netFormula(rowIndex)]]);
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

// Renames the company folder to "BX - {companyName}" when the name changes in
// Settings. The folder is found by its hidden bxRoot marker, never its name,
// so a rename can't lose it; sharing and contents are untouched.
export async function renameCompanyRootFolder(token, rootFolderId, companyName) {
  await driveFetch(token, `${DRIVE_BASE}/files/${rootFolderId}?fields=id`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name: `BX - ${companyName}` }),
  });
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
// Returns { notified } — whether Google emailed the person. Google refuses
// app-sent sharing emails at times (unreviewed apps, email limits), and that
// refusal used to fail the whole share. Then the share is retried without
// the email, which works for any Google account; the caller tells the owner
// to let the person know. A real auth failure (401) is never retried here.
export async function shareWithEmail(token, fileId, email, role = "reader") {
  const share = (notify) =>
    driveFetch(token, `${DRIVE_BASE}/files/${fileId}/permissions?sendNotificationEmail=${notify}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ role, type: "user", emailAddress: email }),
    });
  try {
    await share(true);
    return { notified: true };
  } catch (err) {
    if (/\(401\)/.test(err.message || "")) throw err;
    await share(false);
    return { notified: false };
  }
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
//   fiscalYearStart — month the business's year starts, "1" (January) to "12"
//   bankName, bankLast4 — the account the business pays from, for reference
//     only. Never the full account number.
//   cat0..cat19, hiddenCats — the owner's own categories and hidden built-ins;
//     see lib/categories.js
const PROFILE_KEYS = [
  "companyName",
  "accountantEmail",
  "fiscalYearStart",
  "bankName",
  "bankLast4",
  "currency",
  HIDDEN_CATEGORIES_KEY,
  ...CUSTOM_CATEGORY_KEYS,
];

// Profiles saved before a key existed read back with these.
const PROFILE_DEFAULTS = { fiscalYearStart: "1", currency: "CAD" };

// Returns the saved profile, or null if setup hasn't been completed yet.
export async function getProfile(token, rootFolderId) {
  const data = await driveFetch(token, `${DRIVE_BASE}/files/${rootFolderId}?fields=properties`);
  const props = data.properties || {};
  if (!props.companyName) return null;
  const profile = {};
  for (const key of PROFILE_KEYS) profile[key] = props[key] || PROFILE_DEFAULTS[key] || "";
  return profile;
}

// Writes only the keys passed in. Drive merges properties, so a caller that
// updates one field (say, the accountant) leaves the others as they were.
export async function saveProfile(token, rootFolderId, profile) {
  const properties = {};
  for (const key of PROFILE_KEYS) {
    if (key in profile) properties[key] = String(profile[key] ?? "");
  }
  await driveFetch(token, `${DRIVE_BASE}/files/${rootFolderId}?fields=id`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ properties }),
  });
}

// ── Moving a category's receipts (owner request 2026-11-02) ──
//
// Removing or renaming one of the owner's own categories moves its receipts,
// so past months never show a category that no longer exists. That means
// walking every month ever saved: {root}/{Year}/{Month}/Expenses.

async function listFolders(token, parentId) {
  const q = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and trashed=false and '${parentId}' in parents`
  );
  const list = await driveFetch(token, `${DRIVE_BASE}/files?q=${q}&fields=files(id,name)&pageSize=200`);
  return list.files || [];
}

// Every receipt filed under `category`, grouped by sheet:
// [{ sheetId, cells: ["C5", "C9"] }, …]. Read-only.
export async function findCategoryRows(token, rootId, category) {
  const found = [];
  const years = await listFolders(token, rootId);
  for (const year of years) {
    const months = await listFolders(token, year.id);
    for (const month of months) {
      const sheetId = await findSheetId(token, EXPENSES_SHEET, month.id);
      if (!sheetId) continue;
      const rows = await listExpenseRows(token, sheetId);
      const cells = rows
        .filter((r) => r.category === category)
        .map((r) => `${r.layout === "v2" ? "C" : "F"}${r.rowIndex}`);
      if (cells.length) found.push({ sheetId, cells });
    }
  }
  return found;
}

// Writes the new category into those cells, one request per sheet.
export async function moveCategoryRows(token, plan, toCategory) {
  for (const { sheetId, cells } of plan) {
    await driveFetch(token, `${SHEETS_BASE}/${sheetId}/values:batchUpdate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        valueInputOption: "RAW",
        data: cells.map((range) => ({ range, values: [[toCategory]] })),
      }),
    });
  }
}

// Sheet layout v2 (owner request 2026-07-10): Category sits beside Vendor,
// and "Place" is renamed "Vendor" (the accounting term). ensureHeaderRow
// migrates v1 sheets (Date|Place|Total|HST|Receipt Link[|Category]) in place.
// v3 (owner request 2026-10-17) adds Type in G: was the business invoiced
// (Expense, money out) or is it invoicing (Income, money in). Appended after
// BX's columns so none of them move; see ensureBxColumns.
const TYPE_HEADER = "Type";
// The note the owner leaves for their accountant on a receipt (owner request
// 2026-10-24), right after Type. Named in full so it can't be confused with a
// "Notes" column an accountant may already keep.
const NOTE_HEADER = "Note for accountant";
// Total minus HST (owner request 2026-11-02).
const NET_HEADER = "Net amount";
const NET_HEADER_SHORT = "Net"; // what the owner titled their own, by hand
const LINK_HEADER = "Receipt Link";
const EXPENSE_SHEET_HEADER = ["Date", "Vendor", "Category", "Total", "HST", "Receipt Link", TYPE_HEADER, NOTE_HEADER, NET_HEADER];
const V2_HEADER = EXPENSE_SHEET_HEADER.slice(0, 6);

export const ENTRY_TYPES = { expense: "Expense", income: "Income" };

// Anything that isn't plainly "Income" — blank cells on older rows, typos
// from a hand edit — counts as an expense, which is what BX always assumed.
export function normalizeEntryType(v) {
  return String(v ?? "").trim().toLowerCase() === "income" ? ENTRY_TYPES.income : ENTRY_TYPES.expense;
}
const SUPPORTING_DOCS = "Supporting Documents";
const EXPENSES_SHEET = "Expenses";

function yearMonthName(date) {
  return {
    year: String(date.getFullYear()),
    monthName: date.toLocaleString("en-US", { month: "long" }),
  };
}

// Ensures {root}/{Year}/{MonthName}/Supporting Documents + Expenses sheet exist. Creates as needed.
// currency formats Total/HST when this month's sheet is created; existing
// sheets keep whatever format they already have.
export async function ensureMonthFolders(token, rootId, date, currency) {
  const { year, monthName } = yearMonthName(date);
  const yearId = await findOrCreateFolder(token, year, rootId);
  const monthId = await findOrCreateFolder(token, monthName, yearId);
  const docsId = await findOrCreateFolder(token, SUPPORTING_DOCS, monthId);
  const { sheetId, typeIndex, noteIndex, netIndex, linkIndex } = await findOrCreateSheet(token, EXPENSES_SHEET, monthId, EXPENSE_SHEET_HEADER, currency);
  return { yearId, monthId, docsId, sheetId, typeIndex, noteIndex, netIndex, linkIndex };
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
export async function saveExpenseToDrive(token, { rootId, imageBase64, mimeType, filename, place, total, hst, date, category, type, note, currency }) {
  let receiptDate = date ? new Date(`${date}T00:00:00`) : new Date();
  // Backstop: never let an unparseable date reach the folder-naming logic —
  // that's how "NaN"/"Invalid Date" folders get created on Drive.
  if (isNaN(receiptDate.getTime())) receiptDate = new Date();
  const { docsId, sheetId, typeIndex, noteIndex, netIndex, linkIndex } = await ensureMonthFolders(token, rootId, receiptDate, currency);

  const uploadResult = await uploadImageToFolder(token, docsId, filename, imageBase64, mimeType);
  const row = [
    date || "",
    sanitizeSheetText(place),
    sanitizeSheetText(category || OTHER_CATEGORY),
    cleanAmount(total),
    cleanAmount(hst),
  ];
  // Everything from F on goes under its own title; a column of the owner's in
  // between stays blank on this new row.
  while (row.length < Math.max(linkIndex, typeIndex, noteIndex)) row.push("");
  row[linkIndex] = uploadResult.webViewLink || "";
  row[typeIndex] = normalizeEntryType(type);
  row[noteIndex] = sanitizeSheetText(note);
  const appended = await appendExpenseRow(token, sheetId, row);

  // The formula needs the row number, which only the append can tell us. The
  // receipt is saved by now, so a failure here must not read as a failed save:
  // saving again would file the receipt twice.
  try {
    const rowNumber = /!\$?[A-Z]+\$?(\d+)/.exec(appended?.updates?.updatedRange || "")?.[1];
    if (rowNumber) {
      const netCell = `${columnLetter(netIndex)}${rowNumber}`;
      await putValuesUserEntered(token, sheetId, `${netCell}:${netCell}`, [[netFormula(rowNumber)]]);
    }
  } catch (err) {
    console.warn("Couldn't fill in the net amount", err);
  }

  return { photoLink: uploadResult.webViewLink, sheetId };
}

// ── The annual report (owner request 2026-11-02) ──
//
// One sheet per fiscal year in the company folder, an Overview tab then a tab
// per month; lib/annualReport.js decides what's in the cells. It's rebuilt from
// the monthly sheets, so editing a tab here shows a warning first.

function tabRange(title, cells) {
  return `'${title.replace(/'/g, "''")}'!${cells}`;
}

// The formats a month tab keeps for good: only the cell values get replaced.
function monthTabFormatRequests(sheetId, currency) {
  const money = { numberFormat: { type: "CURRENCY", pattern: currencyPattern(currency) } };
  return [
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 0, endRowIndex: 1 },
        cell: { userEnteredFormat: { textFormat: { bold: true } } },
        fields: "userEnteredFormat.textFormat.bold",
      },
    },
    {
      updateSheetProperties: {
        properties: { sheetId, gridProperties: { frozenRowCount: 1 } },
        fields: "gridProperties.frozenRowCount",
      },
    },
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, startColumnIndex: 0, endColumnIndex: 1 },
        cell: { userEnteredFormat: { numberFormat: { type: "DATE", pattern: "yyyy-mm-dd" } } },
        fields: "userEnteredFormat.numberFormat",
      },
    },
    {
      repeatCell: {
        range: { sheetId, startRowIndex: 1, startColumnIndex: 5, endColumnIndex: 8 },
        cell: { userEnteredFormat: money },
        fields: "userEnteredFormat.numberFormat",
      },
    },
  ];
}

function warnBeforeEditing(sheetId) {
  return { addProtectedRange: { protectedRange: { range: { sheetId }, warningOnly: true, description: "Built by BX from your monthly sheets" } } };
}

async function reportTabs(token, spreadsheetId) {
  const meta = await driveFetch(token, `${SHEETS_BASE}/${spreadsheetId}?fields=sheets(properties(sheetId,title))`);
  return (meta.sheets || []).map((s) => s.properties);
}

// Finds this year's report, or creates it. Tabs that are missing (a new file, or
// one deleted by hand) get added. Returns which month tabs are brand new, since
// those have nothing in them yet.
async function ensureReportFile(token, rootId, fy, currency) {
  const name = reportFileName(fy);
  let id = await findSheetId(token, name, rootId);
  const isNew = !id;
  if (isNew) {
    const created = await driveFetch(token, `${DRIVE_BASE}/files?fields=id`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, mimeType: "application/vnd.google-apps.spreadsheet", parents: [rootId] }),
    });
    id = await collapseRaceDuplicate(token, created.id, () => findSheetId(token, name, rootId));
  }

  let tabs = await reportTabs(token, id);
  const requests = [];
  let overview = tabs.find((t) => t.title === OVERVIEW_TAB);
  if (!overview) {
    // A new file's only tab is a blank one, named in the account's language.
    const blank = isNew && tabs.length === 1 ? tabs[0] : null;
    const sheetId = blank ? blank.sheetId : 900;
    requests.push(
      blank
        ? { updateSheetProperties: { properties: { sheetId, title: OVERVIEW_TAB, index: 0 }, fields: "title,index" } }
        : { addSheet: { properties: { sheetId, title: OVERVIEW_TAB, index: 0 } } }
    );
    requests.push(warnBeforeEditing(sheetId));
  }
  const newMonths = [];
  fy.months.forEach((month, i) => {
    const title = tabTitle(month);
    if (tabs.some((t) => t.title === title)) return;
    const sheetId = 1000 + i;
    newMonths.push(month);
    requests.push({ addSheet: { properties: { sheetId, title, index: i + 1 } } });
    requests.push(...monthTabFormatRequests(sheetId, currency));
    requests.push(warnBeforeEditing(sheetId));
  });
  if (requests.length) {
    await sheetsBatchUpdate(token, id, requests);
    tabs = await reportTabs(token, id);
  }
  return { id, tabs, newMonths };
}

const LINK_BASE = "https://docs.google.com/spreadsheets/d/";

// Brings a fiscal year's report up to date and returns its link. `dates` picks
// the year (the first one) and the months to re-read, which is what a new receipt
// needs; `full` re-reads all twelve, for when anything else changed. Read-only
// on the monthly sheets.
export async function refreshAnnualReport(token, { rootId, profile, dates, full = false }) {
  const fy = fiscalYear(fiscalStartMonth(profile), 0, dates[0]);
  const currency = currencyCode(profile);
  const { id, tabs, newMonths } = await ensureReportFile(token, rootId, fy, currency);

  const wanted = new Set(dates.map((d) => tabTitle(d)));
  const months = fy.months.filter((m) => full || newMonths.length || wanted.has(tabTitle(m)));

  const data = [];
  for (const month of months) {
    const sheetId = await findMonthExpenseSheetId(token, rootId, month);
    const rows = sheetId ? await listExpenseRows(token, sheetId) : [];
    const values = [REPORT_HEADER, ...monthTabRows(rows, profile)];
    data.push({ range: tabRange(tabTitle(month), `A1:J${values.length}`), values });
  }
  if (data.length) {
    await driveFetch(token, `${SHEETS_BASE}/${id}/values:batchClear`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ranges: months.map((m) => tabRange(tabTitle(m), "A:J")) }),
    });
    await driveFetch(token, `${SHEETS_BASE}/${id}/values:batchUpdate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ valueInputOption: "RAW", data }),
    });
  }

  // The Overview follows what the tabs say now, including months not re-read.
  const params = fy.months.map((m) => `ranges=${encodeURIComponent(tabRange(tabTitle(m), "A2:J"))}`).join("&");
  const read = await driveFetch(token, `${SHEETS_BASE}/${id}/values:batchGet?${params}&valueRenderOption=UNFORMATTED_VALUE`);
  const tabRows = (read.valueRanges || []).flatMap((r) => r.values || []);
  const now = new Date();
  const overview = buildOverview(tabRows, {
    company: profile?.companyName,
    label: fy.label,
    currency,
    today: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`,
  });
  await driveFetch(token, `${SHEETS_BASE}/${id}/values:batchClear`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ ranges: [tabRange(OVERVIEW_TAB, "A:G")] }),
  });
  await driveFetch(token, `${SHEETS_BASE}/${id}/values:batchUpdate`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ valueInputOption: "RAW", data: [{ range: tabRange(OVERVIEW_TAB, `A1:G${overview.values.length}`), values: overview.values }] }),
  });

  const overviewId = tabs.find((t) => t.title === OVERVIEW_TAB).sheetId;
  const touchedTabs = months.map((m) => tabs.find((t) => t.title === tabTitle(m))).filter(Boolean);
  await sheetsBatchUpdate(token, id, [
    ...overviewFormatRequests(overviewId, overview, currency),
    ...touchedTabs.map((t) => ({
      autoResizeDimensions: { dimensions: { sheetId: t.sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: REPORT_HEADER.length } },
    })),
  ]);

  return { url: `${LINK_BASE}${id}/edit`, label: fy.label };
}

// The Overview's rows move as categories appear, so its formats are redone with
// its values.
function overviewFormatRequests(sheetId, { headingRows, amountRows }, currency) {
  const money = { numberFormat: { type: "CURRENCY", pattern: currencyPattern(currency) } };
  const rowFormat = (row, startColumnIndex, endColumnIndex, userEnteredFormat) => ({
    repeatCell: {
      range: { sheetId, startRowIndex: row, endRowIndex: row + 1, startColumnIndex, endColumnIndex },
      cell: { userEnteredFormat },
      fields: `userEnteredFormat(${Object.keys(userEnteredFormat).join(",")})`,
    },
  });
  return [
    { repeatCell: { range: { sheetId }, cell: { userEnteredFormat: {} }, fields: "userEnteredFormat" } },
    ...headingRows.map((row) => rowFormat(row, 0, OVERVIEW_COLUMNS, { textFormat: { bold: true } })),
    ...amountRows.flatMap((row) => [
      rowFormat(row, 3, 6, money),
      rowFormat(row, 6, 7, { numberFormat: { type: "PERCENT", pattern: "0%" } }),
    ]),
    // Column A stays narrow: the title lines spill across the empty cells.
    {
      updateDimensionProperties: {
        range: { sheetId, dimension: "COLUMNS", startIndex: 0, endIndex: 1 },
        properties: { pixelSize: 64 },
        fields: "pixelSize",
      },
    },
    { autoResizeDimensions: { dimensions: { sheetId, dimension: "COLUMNS", startIndex: 1, endIndex: OVERVIEW_COLUMNS } } },
  ];
}
const OVERVIEW_COLUMNS = 7;
