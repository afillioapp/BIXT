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

// Finds a folder by name under a given parent (or root if parentId is null). Creates it if missing.
export async function findOrCreateFolder(token, name, parentId) {
  const parentClause = parentId ? `and '${parentId}' in parents` : "and 'root' in parents";
  const q = encodeURIComponent(
    `mimeType='application/vnd.google-apps.folder' and name='${name.replace(/'/g, "\\'")}' and trashed=false ${parentClause}`
  );
  const list = await driveFetch(token, `${DRIVE_BASE}/files?q=${q}&fields=files(id,name)`);
  if (list.files && list.files.length > 0) {
    return list.files[0].id;
  }
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

// Finds a Google Sheet by name in a folder, or creates it with a header row.
export async function findOrCreateSheet(token, name, parentId, headerRow) {
  const q = encodeURIComponent(
    `mimeType='application/vnd.google-apps.spreadsheet' and name='${name.replace(/'/g, "\\'")}' and trashed=false and '${parentId}' in parents`
  );
  const list = await driveFetch(token, `${DRIVE_BASE}/files?q=${q}&fields=files(id,name)`);
  if (list.files && list.files.length > 0) {
    return list.files[0].id;
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

  return created.id;
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

// Returns the ID of the root BIXT folder (creates it if it doesn't exist).
export async function getRootFolderId(token) {
  return findOrCreateFolder(token, "BIXT", null);
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

// The onboarding profile is stored as custom properties on the BIXT root
// folder itself, so no extra visible file clutters the user's Drive.
const PROFILE_KEYS = ["companyName", "accountantName"];

// Returns the saved profile, or null if onboarding hasn't been completed yet.
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

// Ensures BIXT / Company / YYYY / MM / {Photos,Table} exist and returns their IDs.
export async function ensureCompanyMonthFolders(token, rootId, companyName, monthLabel) {
  const [year, month] = monthLabel.split("-");
  const companyId = await findOrCreateFolder(token, companyName, rootId);
  const yearId = await findOrCreateFolder(token, year, companyId);
  const monthId = await findOrCreateFolder(token, month, yearId);
  const photosId = await findOrCreateFolder(token, "Photos", monthId);
  const tableId = await findOrCreateFolder(token, "Table", monthId);
  return { companyId, yearId, monthId, photosId, tableId };
}

// Orchestrates the full save: root -> company -> year -> month -> Photos/Table subfolders -> upload + row.
export async function saveExpenseToDrive(token, { companyName, monthLabel, imageBase64, mimeType, filename, rowValues, sheetHeader }) {
  const rootId = await getRootFolderId(token);
  const { photosId, tableId } = await ensureCompanyMonthFolders(token, rootId, companyName, monthLabel);

  const uploadResult = await uploadImageToFolder(token, photosId, filename, imageBase64, mimeType);
  const sheetId = await findOrCreateSheet(token, `Expenses - ${monthLabel}`, tableId, sheetHeader);
  await appendExpenseRow(token, sheetId, [...rowValues, uploadResult.webViewLink || ""]);

  return { photoLink: uploadResult.webViewLink, sheetId };
}
