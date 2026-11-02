import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { Camera, Image as GalleryIcon, Plus, Check, X } from "lucide-react";
import { useDrive } from "../lib/useDrive";
import { compressImage } from "../lib/image";
import { saveExpenseToDrive, findMonthExpenseSheetId, listExpenseRows, withFreshToken } from "../lib/google";
import { takePendingCapture } from "../lib/pendingCapture";
import DriveFallback from "../components/DriveFallback";
import PageHeader from "../components/PageHeader";
import EntryTypePicker from "../components/EntryTypePicker";
import CategoryPicker from "../components/CategoryPicker";
import { OTHER_CATEGORY, customCategories, hiddenCategories } from "../lib/categories";
import { normalizeDate, sameReceipt } from "../lib/duplicates";
import { scheduleReportRefresh } from "../lib/reportQueue";
import { currencyCode } from "../lib/insights";

// Receipt capture, in batches (owner request 2026-10-29): shoot or pick as
// many receipts as you like — they're unrelated, this is just faster. Each
// photo is compressed and read in the background, one after another, while
// you keep shooting. Then the receipts are reviewed one at a time ("Receipt
// 2 of 5"): check the fields, answer money out / money in, "Save & next".
// Nothing is saved without being reviewed.
//
// The strip at the top shows the batch, a mark on each photo: a spinner while
// it's being read, a faded tick once it read fine, a "!" if something needs a
// look, and a solid tick once saved. Tap a thumbnail to review that one next;
// "+" adds more from the camera or the phone's photos (several at once), up to
// MAX_BATCH waiting at a time. "Save all" saves every receipt that's fine in
// one go and leaves the "!" ones for review (owner request 2026-11-03).
//
// A receipt that matches one already saved, or an earlier one in this batch, is
// a "!" too (owner request 2026-11-02). Two real purchases can look the same, so
// the owner can still choose "Save anyway". If the saved receipts can't be read,
// the check quietly passes rather than getting in the way of saving.
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

const BLANK_FORM = { place: "", total: "", hst: "", date: "", category: OTHER_CATEGORY, type: "", note: "" };

let nextId = 1;

// Receipts waiting to be saved at once (owner request 2026-11-03).
const MAX_BATCH = 10;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function validDate(dateStr) {
  if (!DATE_RE.test(dateStr || "")) return false;
  return !isNaN(new Date(`${dateStr}T00:00:00`).getTime());
}

// The part only the owner can fix. A receipt that merely failed to save (a
// network blip) isn't in here, so "Save all" tries it again.
function fieldProblem(it) {
  if (it.status !== "ready") return "";
  if (it.unusable) return "This photo couldn't be opened. Remove it and try again.";
  const missing = [];
  if (!(it.form?.place || "").trim()) missing.push("vendor");
  if (!String(it.form?.total ?? "").trim()) missing.push("total");
  if (!validDate(it.form?.date)) missing.push("date");
  if (!missing.length) return "";
  return `Please check the ${missing.join(", ").replace(/, ([^,]*)$/, " and $1")}.`;
}

// Why this looks like a receipt we already have, or "". items is the whole batch
// and monthRows the saved receipts by "YYYY-MM".
function duplicateProblem(it, items, monthRows) {
  if (it.status !== "ready" || !it.form || it.keepDuplicate) return "";
  const earlier = items.slice(0, Math.max(0, items.findIndex((other) => other.id === it.id)));
  const twin = earlier.find((other) => other.form && sameReceipt(it.form, other.form));
  if (twin) return `This looks like a duplicate of receipt ${items.indexOf(twin) + 1} in this batch.`;
  const date = normalizeDate(it.form.date);
  const saved = (monthRows[date.slice(0, 7)] || []).find((row) => sameReceipt(it.form, row));
  return saved ? `This looks like a duplicate: ${saved.place}, ${saved.total} on ${date} is already saved.` : "";
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
    reloadProfile,
  } = useDrive(user);

  // The batch. status: "reading" | "ready" | "saved"
  // ready items carry { base64, mime, preview, form, message }.
  const [items, setItems] = useState([]);
  const [currentId, setCurrentId] = useState(null);
  const [typeMissing, setTypeMissing] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState(null); // { type, text } about the whole batch
  const [batchMissing, setBatchMissing] = useState(false);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const batchCardRef = useRef(null);
  // Receipts already saved, by "YYYY-MM", for the duplicate check.
  const [monthRows, setMonthRows] = useState({});
  const monthRowsRef = useRef(monthRows);
  monthRowsRef.current = monthRows;
  const monthLoads = useRef({});

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
  // Waits for the profile, so the reader knows this business's own categories.
  useEffect(() => {
    if (!profile) return;
    const files = takePendingCapture();
    if (files.length) addFiles(files);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile]);

  function loadMonth(dateStr) {
    if (!validDate(dateStr) || !rootFolderId) return Promise.resolve();
    const key = dateStr.slice(0, 7);
    if (!monthLoads.current[key]) {
      monthLoads.current[key] = withFreshToken(accessToken, refreshAccessToken, async (token) => {
        const sheetId = await findMonthExpenseSheetId(token, rootFolderId, new Date(`${dateStr}T00:00:00`));
        return sheetId ? listExpenseRows(token, sheetId) : [];
      })
        .catch(() => [])
        .then((rows) => {
          monthRowsRef.current = { ...monthRowsRef.current, [key]: rows };
          setMonthRows(monthRowsRef.current);
        });
    }
    return monthLoads.current[key];
  }

  useEffect(() => {
    for (const it of items) loadMonth(it.form?.date);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [items, rootFolderId]);

  // What's wrong with a read receipt, in plain words, or "" if it's fine. Behind
  // the "!" on its photo, and what keeps "Save all" from saving it.
  const duplicateOf = (it) => duplicateProblem(it, itemsRef.current, monthRowsRef.current);
  const problemWith = (it) => (it.status === "ready" ? fieldProblem(it) || duplicateOf(it) || it.saveProblem || "" : "");

  const reportDrive = { accessToken, refreshAccessToken, rootFolderId, profile };

  function patch(id, changes) {
    setItems((list) => list.map((it) => (it.id === id ? { ...it, ...changes } : it)));
  }

  function addFiles(fileList) {
    const picked = Array.from(fileList || []).filter(Boolean);
    if (!picked.length) return;
    const waiting = itemsRef.current.filter((it) => it.status !== "saved").length;
    const files = picked.slice(0, Math.max(0, MAX_BATCH - waiting));
    if (files.length < picked.length) {
      setNote({
        type: "error",
        text: files.length
          ? `You can add ${MAX_BATCH} at a time, so I added the first ${files.length}. Save these, then add the rest.`
          : `You can add ${MAX_BATCH} at a time. Save these first, then add more.`,
      });
    } else {
      setNote(null);
    }
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
      patch(it.id, { status: "ready", form: { ...BLANK_FORM }, message: { type: "error", text: "Couldn't open this photo — please retake it." }, unusable: true });
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
        body: JSON.stringify({
          imageBase64: base64,
          mediaType: mime,
          customCategories: customCategories(profile).map((c) => c.name),
          hiddenCategories: hiddenCategories(profile),
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Couldn't read this receipt");
      patch(it.id, {
        status: "ready",
        form: {
          place: data.result.place || "",
          total: data.result.total || "",
          hst: data.result.hst || "",
          date: data.result.date || "",
          category: data.result.category_suggestion || OTHER_CATEGORY,
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
    setBatchMissing(false);
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
    patch(current.id, { form: { ...current.form, [key]: value }, saveProblem: "", keepDuplicate: false });
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

  // Saves one receipt. tokenBox.token follows a renewed Drive connection, so a
  // "Save all" only has to renew it once.
  async function saveOne(it, tokenBox) {
    const form = it.form;
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
      await doSave(tokenBox.token);
    } catch (err) {
      // Expired Drive token (401): silently fetch a fresh one and retry
      // once, so "left the tab open for an hour" doesn't fail the save.
      if (!/\(401\)/.test(err.message || "")) throw err;
      tokenBox.token = await refreshAccessToken();
      await doSave(tokenBox.token);
    }
    // The photo is in Drive now; drop the big strings, keep the thumbnail.
    patch(it.id, { status: "saved", base64: null, savingNow: false, saveProblem: "" });
    scheduleReportRefresh(reportDrive, { date: new Date(`${form.date}T00:00:00`) });
  }

  // keepAnyway is "Save anyway", on a receipt already showing as a duplicate.
  async function handleConfirm({ keepAnyway = false } = {}) {
    const it = current;
    if (!it || it.status !== "ready" || !it.base64 || !rootFolderId) return;
    if (!it.form.type) {
      // The picker turns red and says why. On a phone it can be above the
      // fold when Save is tapped, so bring it into view and move focus to it
      // (screen readers then land on the question, not a silent Save button).
      setTypeMissing(true);
      typePickerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      typeInputRef.current?.focus({ preventScroll: true });
      return;
    }
    if (!validDate(it.form.date)) {
      setSaveError("Please enter the date as YYYY-MM-DD (e.g. 2026-07-04)");
      return;
    }
    setSaving(true);
    setSaveError("");
    setNote(null);
    // Tapped before the saved receipts finished loading? Wait, then check.
    await loadMonth(it.form.date);
    if (keepAnyway) {
      patch(it.id, { keepDuplicate: true });
    } else if (duplicateOf(it)) {
      setSaving(false);
      return;
    }
    try {
      await saveOne(it, { token: accessToken });
      goTo(nextOpenAfter(it.id));
    } catch (err) {
      setSaveError(err.message || "Couldn't save — try again");
    } finally {
      setSaving(false);
    }
  }

  // Saves every receipt that's fine, one after another, without stopping at
  // each. Waits for photos still being read. Anything with a "!" stays for
  // review, and a failed save just earns that receipt a "!" of its own.
  async function saveAll() {
    if (!rootFolderId || saving) return;
    const unanswered = itemsRef.current.some((it) => it.status !== "saved" && !it.form?.type);
    if (!batchTypeRef.current && unanswered) {
      setBatchMissing(true);
      batchCardRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      return;
    }
    setSaving(true);
    setSaveError("");
    setTypeMissing(false);
    setNote({ type: "info", text: "Saving your receipts…" });
    await readChain.current;
    // Let the last read land in state before looking at the list.
    await new Promise((r) => setTimeout(r, 60));
    await Promise.all(itemsRef.current.map((it) => loadMonth(it.form?.date)));
    await new Promise((r) => setTimeout(r, 60));
    const tokenBox = { token: accessToken };
    let savedNow = 0;
    for (const it of itemsRef.current.filter((x) => x.status === "ready")) {
      if (fieldProblem(it) || !it.base64 || !it.form?.type) continue;
      // An earlier receipt saved a moment ago still counts: it's in the batch.
      if (duplicateOf(it)) continue;
      patch(it.id, { savingNow: true });
      try {
        await saveOne(it, tokenBox);
        savedNow += 1;
      } catch {
        patch(it.id, { savingNow: false, saveProblem: "This one didn't save. Check your connection and try again." });
      }
    }
    await new Promise((r) => setTimeout(r, 30));
    const left = itemsRef.current.filter((x) => x.status !== "saved");
    const saved = `Saved ${savedNow} receipt${savedNow === 1 ? "" : "s"}.`;
    setNote(
      left.length
        ? { type: "error", text: `${saved} ${left.length} need${left.length === 1 ? "s" : ""} a look: tap the photos marked !` }
        : null
    );
    goTo(left[0]?.id ?? null);
    setSaving(false);
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

  const reading = open.filter((it) => it.status === "reading").length;
  const readyToSave = open.filter((it) => it.status === "ready" && !fieldProblem(it) && !duplicateOf(it)).length;
  const batchFull = open.length >= MAX_BATCH;
  const warnIfFull = () => {
    if (batchFull) setNote({ type: "error", text: `You can add ${MAX_BATCH} at a time. Save these first, then add more.` });
  };
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
            {/* Asked once for the whole batch, with "Save all" beside it. */}
            {open.length > 1 && (
              <div ref={batchCardRef} className="mb-4 rounded-2xl bg-card ring-1 ring-hairline p-4">
                <EntryTypePicker
                  legend={`What are these ${open.length} receipts?`}
                  value={batchType}
                  onChange={answerBatch}
                  disabled={saving}
                  missing={batchMissing}
                />
                <p className="mt-2 text-[11px] text-text-secondary">
                  {batchType ? "Applied to every receipt. You can still change one below." : "Answer once for the whole batch."}
                </p>
                <button
                  type="button"
                  onClick={saveAll}
                  disabled={saving}
                  className="w-full mt-3 rounded-full bg-brand-teal py-3 font-semibold text-white hover:opacity-90 transition disabled:opacity-60"
                >
                  {saving ? "Saving…" : readyToSave + reading === 1 ? "Save 1 receipt" : `Save all ${readyToSave + reading}`}
                </button>
              </div>
            )}

            {note && (
              <p className={`text-sm mb-3 ${note.type === "error" ? "text-danger" : "text-text-secondary"}`} role="status">
                {note.text}
              </p>
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
                    aria-label={`Receipt ${i + 1}${
                      it.status === "saved"
                        ? ", saved"
                        : it.status === "reading"
                          ? ", being read"
                          : problemWith(it)
                            ? ", needs a look"
                            : ", ready to save"
                    }`}
                    aria-current={active ? "true" : undefined}
                    className={`relative size-14 shrink-0 rounded-xl overflow-hidden bg-muted ${
                      active ? "ring-2 ring-brand-teal" : "ring-1 ring-hairline"
                    }`}
                  >
                    {it.preview && <img src={it.preview} alt="" className="size-full object-cover" />}
                    {(it.status === "reading" || it.savingNow) && (
                      <span className="absolute inset-0 grid place-items-center bg-black/25">
                        <span className="size-4 rounded-full border-2 border-white/40 border-t-white animate-spin" aria-hidden="true" />
                      </span>
                    )}
                    {it.status === "ready" && !it.savingNow && !problemWith(it) && (
                      <span className="absolute inset-0 grid place-items-center">
                        <span className="size-6 rounded-full bg-brand-teal text-white grid place-items-center opacity-50">
                          <Check className="size-4" strokeWidth={2.6} />
                        </span>
                      </span>
                    )}
                    {it.status === "ready" && !it.savingNow && problemWith(it) && (
                      <span className="absolute inset-0 grid place-items-center">
                        <span className="size-6 rounded-full bg-destructive text-white grid place-items-center text-sm font-bold leading-none">!</span>
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
                htmlFor={batchFull ? undefined : "receiptInput"}
                onClick={warnIfFull}
                aria-label="Take another receipt photo"
                className={`size-14 shrink-0 rounded-xl border border-dashed border-text-tertiary bg-card grid place-items-center cursor-pointer text-brand-teal-deep ${batchFull ? "opacity-40" : ""}`}
              >
                <Plus className="size-5" />
              </label>
              <label
                htmlFor={batchFull ? undefined : "receiptImport"}
                onClick={warnIfFull}
                aria-label="Add receipts from your photos"
                className={`size-14 shrink-0 rounded-xl ring-1 ring-hairline-strong bg-card grid place-items-center cursor-pointer text-text-secondary ${batchFull ? "opacity-40" : ""}`}
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
                    {problemWith(current) ? (
                      <p className="text-sm text-danger" role="alert">
                        {/* The reader's own reason beats a generic "check the total". */}
                        {!duplicateOf(current) && message?.type === "error" ? message.text : problemWith(current)}
                      </p>
                    ) : (
                      message?.type === "success" && <p className={`text-sm ${messageColor}`}>{message.text}</p>
                    )}

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
                      <CategoryPicker
                        value={form.category}
                        onChange={(v) => updateField("category", v)}
                        drive={{ accessToken, refreshAccessToken, rootFolderId, profile, reloadProfile }}
                        disabled={saving}
                      />
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
                        onClick={() => handleConfirm({ keepAnyway: !!duplicateOf(current) })}
                        disabled={saving || current.unusable}
                      >
                        {saving ? "Saving…" : duplicateOf(current) ? "Save anyway" : isLast ? "✓ Save" : "Save & next"}
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
