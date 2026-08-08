import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { updateExpenseRow } from "../lib/google";
import { OFFICIAL_CATEGORIES } from "./CategoryIcon";
import { rowIdFor } from "./ExpenseRow";

// Bottom-sheet edit form for a single expense row (owner request, part of
// swipe-to-act rows). Shared by Home and History's Edit action. Writes
// through updateExpenseRow using the row's own sheetId/rowIndex/layout
// (preserving receiptLink — the photo link is never editable here); errors
// surface inline instead of closing the sheet, so the user's edits aren't
// lost on a failed save.
const inputClass =
  "w-full h-12 rounded-xl bg-card ring-1 ring-input-border px-4 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-brand-teal disabled:opacity-60";

export default function EditExpenseSheet({ accessToken, row, onClose, onSaved }) {
  const [place, setPlace] = useState("");
  const [category, setCategory] = useState("Other");
  const [total, setTotal] = useState("");
  const [hst, setHst] = useState("");
  const [date, setDate] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  // The sheet used to pop in with no transition at all. This is one of the
  // few moments in the app that is genuinely "a sheet arriving" rather than
  // a value changing, so it gets the standard 200ms. Transform + opacity
  // only, so it composites and cannot jank a mid-range phone.
  const [entered, setEntered] = useState(false);
  useEffect(() => {
    const id = requestAnimationFrame(() => setEntered(true));
    return () => cancelAnimationFrame(id);
  }, []);

  // Re-seed the form fields every time a different row is opened for
  // editing (rowIdFor gives a stable identity per sheet+row).
  const rowKey = row ? rowIdFor(row) : null;
  useEffect(() => {
    if (!row) return;
    setPlace(row.place || "");
    setCategory(row.category || "Other");
    setTotal(String(row.total ?? ""));
    setHst(String(row.hst ?? ""));
    setDate(row.date || "");
    setError("");
    setSaving(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [rowKey]);

  if (!row) return null;

  async function handleSave() {
    setError("");
    setSaving(true);
    try {
      await updateExpenseRow(accessToken, row.sheetId, row.rowIndex, row.layout, {
        date,
        place,
        category,
        total,
        hst,
        receiptLink: row.receiptLink,
        hadTrailingCategory: row.hadTrailingCategory,
      });
      onSaved(row);
    } catch (err) {
      setError(err.message || "Couldn't save — try again");
      setSaving(false);
    }
  }

  return (
    <>
      <div
        className={`fixed inset-0 z-40 bg-scrim transition-opacity duration-200 ease-out motion-reduce:transition-none ${
          entered ? "opacity-100" : "opacity-0"
        }`}
        onClick={saving ? undefined : onClose}
        aria-hidden="true"
      />
      <div
        className={`fixed inset-x-0 bottom-0 z-50 bg-card rounded-t-3xl transition-transform duration-200 motion-reduce:transition-none ${
          entered ? "translate-y-0" : "translate-y-full"
        }`}
        style={{ transitionTimingFunction: "cubic-bezier(0.22, 1, 0.36, 1)" }}
      >
        <div className="mx-auto max-w-md px-6 pt-5 pb-8">
          <div className="flex items-center justify-between mb-5">
            <h2 className="text-base font-semibold">Edit expense</h2>
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              aria-label="Close"
              className="text-text-secondary disabled:opacity-40"
            >
              <X className="size-5" />
            </button>
          </div>

          <div className="flex flex-col gap-3">
            {/* Total leads, and is the only field set at Amount Row scale in
                Plex Mono. Of the four it is the one with real financial and
                tax consequence — and the one Claude is most likely to have
                misread, which is why the user opened this sheet. */}
            <div className="flex gap-3">
              <input
                className={`${inputClass} text-[15px] font-mono font-semibold tabular-nums`}
                value={total}
                onChange={(e) => setTotal(e.target.value)}
                placeholder="Total"
                inputMode="decimal"
                aria-label="Total"
                disabled={saving}
              />
              <input
                className={`${inputClass} text-[15px] font-mono font-semibold tabular-nums`}
                value={hst}
                onChange={(e) => setHst(e.target.value)}
                placeholder="HST"
                inputMode="decimal"
                aria-label="HST"
                disabled={saving}
              />
            </div>
            <input
              className={inputClass}
              value={place}
              onChange={(e) => setPlace(e.target.value)}
              placeholder="Vendor"
              aria-label="Vendor"
              disabled={saving}
            />
            <select
              className={inputClass}
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              aria-label="Category"
              disabled={saving}
            >
              {OFFICIAL_CATEGORIES.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>
            <input
              className={inputClass}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              aria-label="Date"
              disabled={saving}
            />
          </div>

          {error && <p className="text-sm text-destructive mt-3">{error}</p>}

          <button
            type="button"
            onClick={handleSave}
            disabled={saving || !place.trim()}
            className="w-full rounded-full bg-brand-teal py-4 font-semibold text-brand-teal-foreground hover:opacity-90 transition disabled:opacity-60 mt-5"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
      </div>
    </>
  );
}
