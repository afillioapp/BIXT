import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { useDrive } from "../lib/useDrive";
import { compressImage } from "../lib/image";
import { saveExpenseToDrive } from "../lib/google";
import { takePendingCapture } from "../lib/pendingCapture";
import DriveFallback from "../components/DriveFallback";

// "04 july 2026 Dollarama.jpg" — falls back to "Untitled" if the merchant name wasn't read.
function formatReceiptFilename(dateStr, place) {
  const parsed = dateStr ? new Date(`${dateStr}T00:00:00`) : null;
  const d = parsed && !isNaN(parsed.getTime()) ? parsed : new Date();
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString("en-US", { month: "long" }).toLowerCase();
  const merchant = (place || "").trim().replace(/[\\/:*?"<>|]/g, "").trim();
  return `${day} ${month} ${d.getFullYear()} ${merchant || "Untitled"}.jpg`;
}

export default function Capture({ user }) {
  const router = useRouter();
  const {
    accessToken,
    rootFolderId,
    profile,
    profileLoading,
    needsConnect,
    loadError,
    requestAccess,
    refreshAccessToken,
    retryConnection,
  } = useDrive(user);

  const [imagePreview, setImagePreview] = useState(null);
  const [compressedBase64, setCompressedBase64] = useState(null);
  const [compressedMime, setCompressedMime] = useState(null);
  const [form, setForm] = useState(null); // { place, total, hst, date, category }
  const [categoryOptions, setCategoryOptions] = useState([]);
  const [status, setStatus] = useState(null);
  const [compressing, setCompressing] = useState(false);
  const [extracting, setExtracting] = useState(false);
  const [saving, setSaving] = useState(false);

  const fileInputRef = useRef(null);
  const importInputRef = useRef(null);

  // Only send someone to onboarding when we positively know they have no BX
  // folder — i.e. Drive answered us. A connection problem (loadError) or a
  // missing token (needsConnect) must never re-onboard an existing customer.
  useEffect(() => {
    if (!profileLoading && !profile && accessToken && !loadError && !needsConnect) {
      router.replace("/setup");
    }
  }, [profileLoading, profile, accessToken, loadError, needsConnect]);

  // Pick up a photo/import handed off from the bottom-nav camera popover
  // (components/BottomNav.js), which pushes here right after stashing the
  // File — runs the exact same pipeline as picking a file with this page's
  // own Take/Import buttons below.
  useEffect(() => {
    const file = takePendingCapture();
    if (file) processFile(file);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function processFile(file) {
    if (!file) return;
    setForm(null);
    setStatus(null);
    setCompressing(true);
    try {
      const { base64, mimeType } = await compressImage(file);
      setCompressedBase64(base64);
      setCompressedMime(mimeType);
      setImagePreview(`data:${mimeType};base64,${base64}`);
      await extractReceipt(base64, mimeType);
    } catch (err) {
      setStatus({ type: "error", text: err.message });
    } finally {
      setCompressing(false);
    }
  }

  function handleFileChange(e) {
    const file = e.target.files[0];
    if (!file) return;
    processFile(file);
  }

  async function extractReceipt(base64, mediaType) {
    setExtracting(true);
    setStatus({ type: "info", text: "Reading receipt..." });
    try {
      // The extract endpoint only serves signed-in users; prove who we are.
      const idToken = await user.getIdToken();
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${idToken}`,
        },
        body: JSON.stringify({ imageBase64: base64, mediaType }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Extraction failed");
      setCategoryOptions(data.categories || []);
      setForm({
        place: data.result.place || "",
        total: data.result.total || "",
        hst: data.result.hst || "",
        date: data.result.date || "",
        category: data.result.category_suggestion || "Other",
      });
      setStatus({ type: "success", text: "Receipt read. Review and confirm." });
    } catch (err) {
      setStatus({ type: "error", text: err.message });
    } finally {
      setExtracting(false);
    }
  }

  function updateField(key, value) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  function resetForNext() {
    setImagePreview(null);
    setCompressedBase64(null);
    setCompressedMime(null);
    setForm(null);
    setCategoryOptions([]);
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (importInputRef.current) importInputRef.current.value = "";
  }

  async function handleConfirm() {
    if (!form || !compressedBase64 || !rootFolderId) return;
    const parsedDate = form.date ? new Date(`${form.date}T00:00:00`) : null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date || "") || !parsedDate || isNaN(parsedDate.getTime())) {
      setStatus({ type: "error", text: "Please enter the date as YYYY-MM-DD (e.g. 2026-07-04)" });
      return;
    }
    setSaving(true);
    setStatus({ type: "info", text: "Saving to Google Drive..." });
    const doSave = (token) =>
      saveExpenseToDrive(token, {
        rootId: rootFolderId,
        imageBase64: compressedBase64,
        mimeType: compressedMime,
        filename: formatReceiptFilename(form.date, form.place),
        place: form.place,
        total: form.total,
        hst: form.hst,
        date: form.date,
        category: form.category,
      });
    try {
      try {
        await doSave(accessToken);
      } catch (err) {
        // Expired Drive token (401): silently fetch a fresh one and retry
        // once, so "left the tab open for an hour" doesn't fail the save.
        if (!/\(401\)/.test(err.message || "")) throw err;
        const freshToken = await refreshAccessToken();
        await doSave(freshToken);
      }
      setStatus({ type: "success", text: "Saved" });
      resetForNext();
    } catch (err) {
      setStatus({ type: "error", text: err.message });
    } finally {
      setSaving(false);
    }
  }

  if (profileLoading || !profile) {
    return (
      <div className="container">
        <div className="app-header">
          <div>
            <h1>New receipt</h1>
          </div>
        </div>
        <DriveFallback
          needsConnect={needsConnect}
          loadError={loadError}
          onConnect={requestAccess}
          onRetry={retryConnection}
        />
      </div>
    );
  }

  // Reading (client-side compression + the OCR call) and saving both render
  // as the same "busy" pattern — a spinner + status line under the photo.
  const busy = compressing || extracting;

  return (
    <div className="container capture-screen">
      <h1 className="capture-title">New receipt</h1>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChange}
        className="hidden-input"
        id="receiptInput"
      />
      <input
        ref={importInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChange}
        className="hidden-input"
        id="receiptImport"
      />

      {!imagePreview && !form && (
        <>
          <div className="capture-placeholder-wrap">
            <div className="capture-placeholder" aria-hidden="true">
              <svg width="44" height="38" viewBox="0 0 44 38">
                <path
                  d="M15 4l3-3h8l3 3h8a4 4 0 0 1 4 4v22a4 4 0 0 1-4 4H4a4 4 0 0 1-4-4V8a4 4 0 0 1 4-4z"
                  fill="none"
                  stroke="var(--muted)"
                  strokeWidth="1.6"
                  strokeLinejoin="round"
                />
                <circle cx="22" cy="20" r="8" fill="none" stroke="var(--muted)" strokeWidth="1.6" />
              </svg>
            </div>
          </div>
          <div className="capture-initial-actions">
            <label htmlFor="receiptInput" className="btn btn-primary">
              {compressing ? "Processing…" : "Take Receipt Photo"}
            </label>
            <label htmlFor="receiptImport" className="btn btn-secondary">
              Import from Phone
            </label>
          </div>
        </>
      )}

      {imagePreview && (
        <div className="capture-body">
          <img src={imagePreview} className="receipt-preview" alt="receipt" />

          {!form && status && (
            <div className="capture-busy-row">
              {busy && <span className="capture-spinner" aria-hidden="true" />}
              <span className={`status status-${status.type}`}>{status.text}</span>
            </div>
          )}

          {form && (
            <>
              {status && <div className={`status status-${status.type}`}>{status.text}</div>}

              <div className="capture-fields">
                <input
                  value={form.place}
                  onChange={(e) => updateField("place", e.target.value)}
                  placeholder="Vendor"
                />

                <div className="row">
                  <input
                    value={form.total}
                    onChange={(e) => updateField("total", e.target.value)}
                    placeholder="Total"
                  />
                  <input
                    value={form.hst}
                    onChange={(e) => updateField("hst", e.target.value)}
                    placeholder="HST / Tax"
                  />
                </div>

                <input
                  type="date"
                  value={form.date}
                  onChange={(e) => updateField("date", e.target.value)}
                  placeholder="YYYY-MM-DD"
                  onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
                />

                <select
                  value={form.category}
                  onChange={(e) => updateField("category", e.target.value)}
                >
                  {(categoryOptions.length ? categoryOptions : [form.category]).map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>

              <div className="capture-form-actions">
                <button
                  className="btn btn-secondary"
                  onClick={resetForNext}
                  disabled={saving}
                >
                  Retake
                </button>
                <button
                  className="btn btn-primary"
                  onClick={handleConfirm}
                  disabled={saving}
                >
                  {saving ? "Saving…" : "✓ Save"}
                </button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
