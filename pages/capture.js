import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { Camera, Image as GalleryIcon } from "lucide-react";
import { useDrive } from "../lib/useDrive";
import { compressImage } from "../lib/image";
import { saveExpenseToDrive } from "../lib/google";
import { takePendingCapture } from "../lib/pendingCapture";
import DriveFallback from "../components/DriveFallback";

// Rebuilt in the ported Lovable design language (light bg-background page,
// white ring-1 cards, teal/navy pills, design-system inputs) — the
// initial/busy/review stages, category select, and retake/save actions all
// keep their exact prior behavior: pendingCapture pickup, /setup redirect
// guard, and the 401 retry-once save are byte-equivalent in effect.

// "04 july 2026 Dollarama.jpg" — falls back to "Untitled" if the merchant name wasn't read.
function formatReceiptFilename(dateStr, place) {
  const parsed = dateStr ? new Date(`${dateStr}T00:00:00`) : null;
  const d = parsed && !isNaN(parsed.getTime()) ? parsed : new Date();
  const day = String(d.getDate()).padStart(2, "0");
  const month = d.toLocaleString("en-US", { month: "long" }).toLowerCase();
  const merchant = (place || "").trim().replace(/[\\/:*?"<>|]/g, "").trim();
  return `${day} ${month} ${d.getFullYear()} ${merchant || "Untitled"}.jpg`;
}

const inputClass =
  "w-full h-12 rounded-xl bg-white ring-1 ring-black/10 px-4 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-brand-teal";

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
      <div className="min-h-screen bg-background font-sans text-text-primary pb-28">
        <div className="bg-brand-navy rounded-b-3xl pt-10 pb-7 text-white">
          <div className="mx-auto max-w-md px-5">
            <h1 className="text-2xl font-semibold tracking-tight">New receipt</h1>
          </div>
        </div>
        <div className="mx-auto max-w-md px-5 pt-6">
          <DriveFallback
            needsConnect={needsConnect}
            loadError={loadError}
            onConnect={requestAccess}
            onRetry={retryConnection}
          />
        </div>
      </div>
    );
  }

  // Reading (client-side compression + the OCR call) and saving both render
  // as the same "busy" pattern — a spinner + status line under the photo.
  const busy = compressing || extracting;

  const statusColor =
    status?.type === "error" ? "text-destructive" : status?.type === "success" ? "text-brand-teal" : "text-text-secondary";

  return (
    <div className="min-h-screen bg-background font-sans text-text-primary flex flex-col">
      <div className="bg-brand-navy rounded-b-3xl pt-10 pb-7 text-white">
        <div className="mx-auto max-w-md px-5">
          <h1 className="text-2xl font-semibold tracking-tight">New receipt</h1>
        </div>
      </div>

      <div className="mx-auto max-w-md w-full px-5 pt-6 pb-28 flex flex-col flex-1">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
          id="receiptInput"
        />
        <input
          ref={importInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
          id="receiptImport"
        />

        {!imagePreview && !form && (
          <>
            <div className="flex-1 flex items-center justify-center min-h-[160px]">
              <div className="size-32 rounded-3xl bg-brand-teal-soft grid place-items-center" aria-hidden="true">
                <Camera className="size-11 text-brand-teal" strokeWidth={1.4} />
              </div>
            </div>
            <div className="flex flex-col gap-2.5">
              <label
                htmlFor="receiptInput"
                className="w-full rounded-full bg-brand-teal py-4 font-semibold text-white text-center cursor-pointer hover:opacity-90 transition"
              >
                {compressing ? "Processing…" : "Take Receipt Photo"}
              </label>
              <label
                htmlFor="receiptImport"
                className="w-full rounded-full bg-white ring-1 ring-black/10 py-4 font-semibold text-text-primary cursor-pointer hover:bg-zinc-50 transition inline-flex items-center justify-center gap-2"
              >
                <GalleryIcon className="size-4" /> Import from Phone
              </label>
            </div>
          </>
        )}

        {imagePreview && (
          <div className="flex flex-col gap-4 flex-1">
            <img
              src={imagePreview}
              className="w-full max-h-72 object-cover rounded-2xl ring-1 ring-black/5"
              alt="receipt"
            />

            {!form && status && (
              <div className="flex items-center gap-2">
                {busy && (
                  <span
                    className="size-3.5 rounded-full border-2 border-zinc-200 border-t-brand-teal animate-spin shrink-0"
                    aria-hidden="true"
                  />
                )}
                <span className={`text-sm ${statusColor}`}>{status.text}</span>
              </div>
            )}

            {form && (
              <>
                {status && <p className={`text-sm ${statusColor}`}>{status.text}</p>}

                <div className="flex flex-col gap-2.5">
                  <input
                    className={inputClass}
                    value={form.place}
                    onChange={(e) => updateField("place", e.target.value)}
                    placeholder="Vendor"
                  />

                  <div className="flex gap-2.5">
                    <input
                      className={inputClass}
                      value={form.total}
                      onChange={(e) => updateField("total", e.target.value)}
                      placeholder="Total"
                    />
                    <input
                      className={inputClass}
                      value={form.hst}
                      onChange={(e) => updateField("hst", e.target.value)}
                      placeholder="HST / Tax"
                    />
                  </div>

                  <input
                    className={inputClass}
                    type="date"
                    value={form.date}
                    onChange={(e) => updateField("date", e.target.value)}
                    placeholder="YYYY-MM-DD"
                    onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
                  />

                  <select
                    className={`${inputClass} appearance-none`}
                    value={form.category}
                    onChange={(e) => updateField("category", e.target.value)}
                  >
                    {(categoryOptions.length ? categoryOptions : [form.category]).map((c) => (
                      <option key={c} value={c}>
                        {c}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex gap-2.5 mt-auto pt-4">
                  <button
                    className="flex-1 rounded-full bg-white ring-1 ring-black/10 py-4 font-semibold text-text-primary hover:bg-zinc-50 transition disabled:opacity-60"
                    onClick={resetForNext}
                    disabled={saving}
                  >
                    Retake
                  </button>
                  <button
                    className="flex-1 rounded-full bg-brand-teal py-4 font-semibold text-white hover:opacity-90 transition disabled:opacity-60"
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
    </div>
  );
}
