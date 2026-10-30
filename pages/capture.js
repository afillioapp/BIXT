import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { Camera, Image as GalleryIcon, Plus, Check, X } from "lucide-react";
import { useDrive } from "../lib/useDrive";
import { compressImage } from "../lib/image";
import { saveExpenseToDrive } from "../lib/google";
import { takePendingCapture } from "../lib/pendingCapture";
import DriveFallback from "../components/DriveFallback";
import PageHeader from "../components/PageHeader";
import EntryTypePicker from "../components/EntryTypePicker";
import { OFFICIAL_CATEGORIES } from "../components/CategoryIcon";
import { currencyCode } from "../lib/insights";

// Receipt capture, in batches (owner request 2026-10-29): shoot or pick as
// many receipts as you like — they're unrelated, this is just faster. Each
// photo is compressed and read in the background, one after another, while
// you keep shooting. Then the receipts are reviewed one at a time ("Receipt
// 2 of 5"): check the fields, answer money out / money in, "Save & next".
// Nothing is saved without being reviewed.
//
// The strip at the top shows the batch: a spinner while a photo is being
// read, a tick once saved. Tap a thumbnail to review that one next; "+" adds
// more from the camera or the phone's photos (several at once).
//
// A photo that can't be read still opens the form with blank fields, so it
// can be typed in — an unreadable photo is never a dead end. /api/extract
// allows 30 reads an hour per user; past that, receipts fall back to typing.
//
// The /setup redirect guard and the 401 retry-once save are unchanged.

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
  "w-full h-12 rounded-xl bg-card ring-1 ring-hairline-strong px-4 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-brand-teal";

const BLANK_FORM = { place: "", total: "", hst: "", date: "", category: "Other", type: "", note: "" };

let nextId = 1;

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

  // The batch. status: "reading" | "ready" | "saved"
  // ready items carry { base64, mime, preview, form, categories, message }.
  const [items, setItems] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const [typeMissing, setTypeMissing] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);

  const cameraInputRef = useRef(null);
  const galleryInputRef = useRef(null);
  const typePickerRef = useRef(null);
  const typeInputRef = useRef(null);
  // Photos are read one after another, never all at once: gentler on the
  // phone and on the hourly reading limit.
  const readChain = useRef(Promise.resolve());
  // A batch is usually all one kind — all bills you're paying, or all
  // invoices you've sent (owner request 2026-10-30). Asked once for the
  // whole batch; each receipt starts with this answer and can still be
  // switched on its own. "" until answered.
  const [batchType, setBatchType] = useState("");
  const batchTypeRef = useRef("");

  // Only send someone to onboarding when we positively know they have no BX
  // folder — i.e. Drive answered us. A connection problem (loadError) or a
  // missing token (needsConnect) must never re-onboard an existing customer.
  useEffect(() => {
    if (!profileLoading && !profile && accessToken && !loadError && !needsConnect) {
      router.replace("/setup");
    }
  }, [profileLoading, profile, accessToken, loadError, needsConnect]);

  // Pick up photos handed off from the bottom menu (components/BottomNav.js).
  useEffect(() => {
    const files = takePendingCapture();
    if (files.length) addFiles(files);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function patch(id, changes) {
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...changes } : it)));
  }

  function addFiles(fileList) {
    const files = Array.from(fileList || []).filter(Boolean);
    if (!files.length) return;
    const fresh = files.map((file) => ({ id: nextId++, file, status: "reading" }));
    setItems((list) => [...list, ...fresh]);
    setCurrentId((cur) => cur ?? fresh[0].id);
    for (const it of fresh) {
      readChain.current = readChain.current.then(() => readItem(it));
    }
  }

  async function readItem(it) {
    let base64;
    let mime;
    try {
      ({ base64, mimeType: mime } = await compressImage(it.file));
    } catch (err) {
      patch(it.id, { status: "ready", form: { ...BLANK_FORM }, categories: OFFICIAL_CATEGORIES, message: { type: "error", text: "Couldn't open this photo — please retake it." }, unusable: true });
      return;
    }
    const preview = `data:${mime};base64,${base64}`;
    patch(it.id, { base64, mime, preview });
    try {
      // The extract endpoint only serves signed-in users; prove who we are.
      const idToken = await user.getIdToken();
      const res = await fetch("/api/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
        body: JSON.stringify({ imageBase64: base64, mediaType: mime }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't read this receipt");
      patch(it.id, {
        status: "ready",
        categories: data.categories || OFFICIAL_CATEGORIES,
        form: {
          place: data.result.place || "",
          total: data.result.total || "",
          hst: data.result.hst || "",
          date: data.result.date || "",
          category: data.result.category_suggestion || "Other",
          // The batch answer if there is one; otherwise deliberately
          // unanswered — the photo can't tell money in from money out.
          type: batchTypeRef.current,
          note: "",
        },
        message: { type: "success", text: "Receipt read. Review and confirm." },
      });
    } catch (err) {
      patch(it.id, {
        status: "ready",
        categories: OFFICIAL_CATEGORIES,
        form: { ...BLANK_FORM, type: batchTypeRef.current },
        message: { type: "error", text: `${err.message} — please enter the details below.` },
      });
    }
  }

  function handleFileChange(e) {
    addFiles(e.target.files);
    e.target.value = "";
  }

  const open = items.filter((it) => it.status !== "saved");
  const current = items.find((it) => it.id === currentId && it.status !== "saved") || open[0] || null;
  const position = current ? items.indexOf(current) + 1 : 0;
  const savedCount = items.filter((it) => it.status === "saved").length;

  function goTo(id) {
    setCurrentId(id);
    setTypeMissing(false);
    setSaveError("");
  }

  // The next receipt still to review after `id`, wrapping round to earlier
  // skipped ones.
  function nextOpenAfter(id) {
    const idx = items.findIndex((it) => it.id === id);
    const after = [...items.slice(idx + 1), ...items.slice(0, idx)];
    return after.find((it) => it.status !== "saved")?.id ?? null;
  }

  // Applies the batch answer to every receipt not saved yet, except ones the
  // owner deliberately set to the other answer.
  function answerBatch(value) {
    const previous = batchTypeRef.current;
    batchTypeRef.current = value;
    setBatchType(value);
    setTypeMissing(false);
    setItems((list) =>
      list.map((it) =>
        it.status !== "saved" && it.form && (it.form.type === "" || it.form.type === previous)
          ? { ...it, form: { ...it.form, type: value } }
          : it
      )
    );
  }

  function updateField(key, value) {
    if (!current) return;
    patch(current.id, { form: { ...current.form, [key]: value } });
    if (key === "type") setTypeMissing(false);
  }

  function removeCurrent() {
    if (!current) return;
    const next = nextOpenAfter(current.id);
    setItems((list) => list.filter((it) => it.id !== current.id));
    goTo(next);
  }

  function skipCurrent() {
    if (!current) return;
    goTo(nextOpenAfter(current.id));
  }

  async function handleConfirm() {
    const it = current;
    if (!it || it.status !== "ready" || !it.base64 || !rootFolderId) return;
    const form = it.form;
    if (!form.type) {
      // The picker turns red and says why. On a phone it can be above the
      // fold when Save is tapped, so bring it into view and move focus to it
      // (screen readers then land on the question, not a silent Save button).
      setTypeMissing(true);
      typePickerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      typeInputRef.current?.focus({ preventScroll: true });
      return;
    }
    const parsedDate = form.date ? new Date(`${form.date}T00:00:00`) : null;
    if (!/^\d{4}-\d{2}-\d{2}$/.test(form.date || "") || !parsedDate || isNaN(parsedDate.getTime())) {
      setSaveError("Please enter the date as YYYY-MM-DD (e.g. 2026-07-04)");
      return;
    }
    setSaving(true);
    setSaveError("");
    const doSave = (token) =>
      saveExpenseToDrive(token, {
        rootId: rootFolderId,
        imageBase64: it.base64,
        mimeType: it.mime,
        filename: formatReceiptFilename(form.date, form.place),
        place: form.place,
        total: form.total,
        hst: form.hst,
        date: form.date,
        category: form.category,
        type: form.type,
        note: form.note || "",
        currency: currencyCode(profile),
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
      const next = nextOpenAfter(it.id);
      // The photo is in Drive now; drop the big strings, keep the thumbnail.
      patch(it.id, { status: "saved", base64: null });
      goTo(next);
    } catch (err) {
      setSaveError(err.message || "Couldn't save — try again");
    } finally {
      setSaving(false);
    }
  }

  if (profileLoading || !profile) {
    return (
      <div className="min-h-screen bg-background font-sans text-text-primary pb-28">
        <PageHeader>
          <h1 className="text-2xl font-semibold tracking-tight">New receipts</h1>
        </PageHeader>
        <div className="mx-auto max-w-md px-5 pt-6">
          <DriveFallback needsConnect={needsConnect} loadError={loadError} onConnect={requestAccess} onRetry={retryConnection} />
        </div>
      </div>
    );
  }

  const form = current?.form;
  const message = current?.message;
  const messageColor = message?.type === "error" ? "text-destructive" : "text-brand-teal-deep";
  const isLast = open.length === 1;

  return (
    <div className="min-h-screen bg-background font-sans text-text-primary flex flex-col">
      <PageHeader>
        <h1 className="text-2xl font-semibold tracking-tight">New receipts</h1>
        {items.length > 0 && (
          <p className="text-xs text-text-secondary mt-1">
            {savedCount} of {items.length} saved
            {current ? ` · reviewing receipt ${position}` : ""}
          </p>
        )}
      </PageHeader>

      <div className="mx-auto max-w-md w-full px-5 pt-6 pb-28 flex flex-col flex-1">
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          onChange={handleFileChange}
          className="hidden"
          id="receiptInput"
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          multiple
          onChange={handleFileChange}
          className="hidden"
          id="receiptImport"
        />

        {items.length === 0 && (
          <>
            <div className="flex-1 flex flex-col items-center justify-center gap-3 min-h-[160px] text-center">
              <div className="size-32 rounded-3xl bg-brand-teal-soft grid place-items-center" aria-hidden="true">
                <Camera className="size-11 text-brand-teal" strokeWidth={1.4} />
              </div>
              <p className="text-sm text-text-secondary max-w-[260px]">
                Snap as many receipts as you like. You'll check each one before it's saved.
              </p>
            </div>
            <div className="flex flex-col gap-2.5">
              <label
                htmlFor="receiptInput"
                className="w-full rounded-full bg-brand-teal py-4 font-semibold text-white text-center cursor-pointer hover:opacity-90 transition"
              >
                Take Receipt Photo
              </label>
              <label
                htmlFor="receiptImport"
                className="w-full rounded-full bg-card ring-1 ring-hairline-strong py-4 font-semibold text-text-primary cursor-pointer hover:bg-muted transition inline-flex items-center justify-center gap-2"
              >
                <GalleryIcon className="size-4" /> Choose photos
              </label>
            </div>
          </>
        )}

        {items.length > 0 && (
          <>
            {/* Asked once for the whole batch (2 or more receipts). */}
            {items.length > 1 && (
              <div className="mb-4 rounded-2xl bg-card ring-1 ring-hairline p-4">
                <EntryTypePicker
                  legend={`What are these ${items.length} receipts?`}
                  value={batchType}
                  onChange={answerBatch}
                  disabled={saving}
                />
                <p className="mt-2 text-[11px] text-text-secondary">
                  {batchType ? "Applied to every receipt. You can still change one below." : "Answer once for the whole batch."}
                </p>
              </div>
            )}

            {/* The batch strip */}
            <div className="flex gap-2 overflow-x-auto pb-1 -mx-5 px-5 scrollbar-none mb-4" aria-label="Receipts in this batch">
              {items.map((it, i) => {
                const active = current && it.id === current.id;
                return (
                  <button
                    key={it.id}
                    type="button"
                    onClick={() => it.status !== "saved" && goTo(it.id)}
                    aria-label={`Receipt ${i + 1}${it.status === "saved" ? ", saved" : it.status === "reading" ? ", being read" : ""}`}
                    aria-current={active ? "true" : undefined}
                    className={`relative size-14 shrink-0 rounded-xl overflow-hidden bg-muted ${
                      active ? "ring-2 ring-brand-teal" : "ring-1 ring-hairline"
                    }`}
                  >
                    {it.preview && <img src={it.preview} alt="" className={`size-full object-cover ${it.status === "saved" ? "opacity-50" : ""}`} />}
                    {it.status === "reading" && (
                      <span className="absolute inset-0 grid place-items-center bg-black/25">
                        <span className="size-4 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden="true" />
                      </span>
                    )}
                    {it.status === "saved" && (
                      <span className="absolute inset-0 grid place-items-center">
                        <span className="size-6 rounded-full bg-brand-teal text-white grid place-items-center">
                          <Check className="size-4" strokeWidth={2.6} />
                        </span>
                      </span>
                    )}
                  </button>
                );
              })}
              <label
                htmlFor="receiptInput"
                aria-label="Take another receipt photo"
                className="size-14 shrink-0 rounded-xl border border-dashed border-text-tertiary bg-card grid place-items-center cursor-pointer text-brand-teal-deep"
              >
                <Plus className="size-5" />
              </label>
              <label
                htmlFor="receiptImport"
                aria-label="Add receipts from your photos"
                className="size-14 shrink-0 rounded-xl ring-1 ring-hairline-strong bg-card grid place-items-center cursor-pointer text-text-secondary"
              >
                <GalleryIcon className="size-5" />
              </label>
            </div>

            {!current && (
              <div className="flex-1 flex flex-col items-center justify-center text-center gap-3 py-10">
                <div className="size-16 rounded-full bg-brand-teal grid place-items-center" aria-hidden="true">
                  <Check className="size-7 text-white" strokeWidth={2.4} />
                </div>
                <p className="text-lg font-semibold">
                  {savedCount === 1 ? "Receipt saved" : `All ${savedCount} receipts saved`}
                </p>
                <p className="text-sm text-text-secondary">They're in your Drive and your accountant can see them.</p>
                <div className="flex gap-2.5 w-full mt-3">
                  <label
                    htmlFor="receiptInput"
                    className="flex-1 rounded-full bg-card ring-1 ring-hairline-strong py-3.5 font-semibold text-text-primary text-center cursor-pointer hover:bg-muted transition"
                  >
                    Take more
                  </label>
                  <button
                    type="button"
                    onClick={() => router.push("/")}
                    className="flex-1 rounded-full bg-brand-teal py-3.5 font-semibold text-white hover:opacity-90 transition"
                  >
                    Done
                  </button>
                </div>
              </div>
            )}

            {current && (
              <div className="flex flex-col gap-4 flex-1">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-semibold">
                    Receipt {position} of {items.length}
                  </p>
                  <button
                    type="button"
                    onClick={removeCurrent}
                    disabled={saving}
                    className="inline-flex items-center gap-1 text-xs text-text-secondary disabled:opacity-60"
                  >
                    <X className="size-3.5" /> Remove
                  </button>
                </div>

                {current.preview ? (
                  <img src={current.preview} className="w-full max-h-64 object-cover rounded-2xl ring-1 ring-hairline" alt="Receipt photo" />
                ) : (
                  <div className="w-full h-40 rounded-2xl bg-muted" aria-hidden="true" />
                )}

                {current.status === "reading" && (
                  <div className="flex items-center gap-2" role="status">
                    <span className="size-3.5 rounded-full border-2 border-track border-t-brand-teal animate-spin shrink-0" aria-hidden="true" />
                    <span className="text-sm text-text-secondary">Reading receipt… you can keep taking photos.</span>
                  </div>
                )}

                {current.status === "ready" && form && (
                  <>
                    {message && <p className={`text-sm ${messageColor}`}>{message.text}</p>}

                    <div ref={typePickerRef}>
                      <EntryTypePicker
                        value={form.type}
                        onChange={(v) => updateField("type", v)}
                        disabled={saving}
                        missing={typeMissing}
                        inputRef={typeInputRef}
                      />
                    </div>

                    <div className="flex flex-col gap-2.5">
                      <input className={inputClass} value={form.place} onChange={(e) => updateField("place", e.target.value)} placeholder="Vendor" />
                      <div className="flex gap-2.5">
                        <input className={inputClass} value={form.total} onChange={(e) => updateField("total", e.target.value)} placeholder="Total" inputMode="decimal" />
                        <input className={inputClass} value={form.hst} onChange={(e) => updateField("hst", e.target.value)} placeholder="HST / Tax" inputMode="decimal" />
                      </div>
                      <input
                        className={inputClass}
                        type="date"
                        value={form.date}
                        onChange={(e) => updateField("date", e.target.value)}
                        placeholder="YYYY-MM-DD"
                        onKeyDown={(e) => e.key === "Enter" && handleConfirm()}
                      />
                      <select className={`${inputClass} appearance-none`} value={form.category} onChange={(e) => updateField("category", e.target.value)}>
                        {(current.categories?.length ? current.categories : [form.category]).map((c) => (
                          <option key={c} value={c}>
                            {c}
                          </option>
                        ))}
                      </select>
                      {/* Saved to the sheet's "Note for accountant" column. */}
                      <textarea
                        className="w-full rounded-xl bg-card ring-1 ring-hairline-strong px-4 py-3 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-brand-teal resize-none disabled:opacity-60"
                        rows={2}
                        maxLength={500}
                        value={form.note || ""}
                        onChange={(e) => updateField("note", e.target.value)}
                        placeholder="Note for your accountant (optional)"
                        aria-label="Note for your accountant"
                        disabled={saving}
                      />
                    </div>

                    {saveError && (
                      <p className="text-sm text-destructive" role="alert">
                        {saveError}
                      </p>
                    )}

                    <div className="flex gap-2.5 mt-auto pt-4">
                      {open.length > 1 && (
                        <button
                          className="flex-1 rounded-full bg-card ring-1 ring-hairline-strong py-4 font-semibold text-text-primary hover:bg-muted transition disabled:opacity-60"
                          onClick={skipCurrent}
                          disabled={saving}
                        >
                          Skip for now
                        </button>
                      )}
                      <button
                        className="flex-1 rounded-full bg-brand-teal py-4 font-semibold text-white hover:opacity-90 transition disabled:opacity-60"
                        onClick={handleConfirm}
                        disabled={saving || current.unusable}
                      >
                        {saving ? "Saving…" : isLast ? "✓ Save" : "Save & next"}
                      </button>
                    </div>
                  </>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
