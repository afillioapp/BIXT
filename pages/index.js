import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { useDrive } from "../lib/useDrive";
import { compressImage } from "../lib/image";
import { saveExpenseToDrive } from "../lib/google";
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

export default function Camera({ user }) {
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
  const [form, setForm] = useState(null); // { place, total, hst, date }
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

  async function handleFileChange(e) {
    const file = e.target.files[0];
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
      setForm({
        place: data.result.place || "",
        total: data.result.total || "",
        hst: data.result.hst || "",
        date: data.result.date || "",
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
    if (fileInputRef.current) fileInputRef.current.value = "";
    if (importInputRef.current) importInputRef.current.value = "";
  }

  async function handleConfirm() {
    if (!form || !compressedBase64 || !rootFolderId) return;
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
            <h1>BX</h1>
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

  return (
    <div className="container">
      <div className="app-header">
        <div>
          {/* Greet the person; phone sign-ins have no display name, so fall
              back to the company. Company name always shows as the subheader. */}
          <h1>Hi, {(user?.displayName || "").trim().split(/\s+/)[0] || profile.companyName}</h1>
          <div className="subtitle">{profile.companyName}</div>
        </div>
      </div>

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

      {/* Capture actions live at the bottom of the screen, in thumb reach —
          not at the top under the header. */}
      {!imagePreview && (
        <div className="capture-actions">
          <label htmlFor="receiptInput" className="btn btn-primary" style={{ cursor: "pointer" }}>
            {compressing ? "Processing…" : "Take Receipt Photo"}
          </label>
          <label htmlFor="receiptImport" className="btn btn-secondary" style={{ cursor: "pointer" }}>
            Import from Phone
          </label>
        </div>
      )}

      {(imagePreview || status || form) && (
      <div className="card">
        {imagePreview && (
          <img src={imagePreview} className="receipt-preview" alt="receipt" />
        )}

        {status && (
          <div className={`status status-${status.type}`}>{status.text}</div>
        )}

        {form && (
          <>
            <label>Place</label>
            <input
              value={form.place}
              onChange={(e) => updateField("place", e.target.value)}
            />

            <div className="row">
              <div>
                <label>Total</label>
                <input
                  value={form.total}
                  onChange={(e) => updateField("total", e.target.value)}
                />
              </div>
              <div>
                <label>HST / Tax</label>
                <input
                  value={form.hst}
                  onChange={(e) => updateField("hst", e.target.value)}
                />
              </div>
            </div>

            <label>Date</label>
            <input
              value={form.date}
              onChange={(e) => updateField("date", e.target.value)}
              placeholder="YYYY-MM-DD"
              onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
            />

            <div className="confirm-row">
              <button
                className="btn btn-secondary retake-btn"
                onClick={resetForNext}
                disabled={saving}
              >
                Retake
              </button>
              <button
                className="tick-btn"
                onClick={handleConfirm}
                disabled={saving}
                title="Confirm and save"
              >
                {saving ? "…" : "✓"}
              </button>
            </div>
          </>
        )}
      </div>
      )}
    </div>
  );
}
