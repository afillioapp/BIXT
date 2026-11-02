import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { ICON_BANK, TINTS } from "./CategoryIcon";
import { GIFI_CATEGORIES, categoryNameProblem, MAX_CATEGORY_NAME } from "../lib/categories";

// Bottom sheet for adding or changing one of the owner's own categories:
// a name, an icon from the bank, in the simple grid the owner picked
// (2026-11-02), and the GIFI code its receipts report under. `children` is extra
// content under Save (the Remove flow on the Categories page). onSave({ name,
// icon, gifi }) may reject; the error shows here and the sheet stays open.
const iconNames = Object.keys(ICON_BANK);
const DEFAULT_GIFI = "9270"; // Other expenses

export default function CategoryEditor({ initial, profile, onSave, onClose, children, busyText = "" }) {
  const editing = !!initial;
  const [name, setName] = useState(initial?.name || "");
  const [icon, setIcon] = useState(initial?.icon && ICON_BANK[initial.icon] ? initial.icon : iconNames[0]);
  const [gifi, setGifi] = useState(initial?.gifi || DEFAULT_GIFI);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setName(initial?.name || "");
    setIcon(initial?.icon && ICON_BANK[initial.icon] ? initial.icon : iconNames[0]);
    setGifi(initial?.gifi || DEFAULT_GIFI);
    setError("");
  }, [initial]);

  async function submit() {
    const problem = categoryNameProblem(name, profile, initial?.name || "");
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({ name: name.trim(), icon, gifi });
    } catch (err) {
      setError(err?.message || "Couldn't save. Check your connection and try again.");
      setSaving(false);
    }
  }

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={saving ? undefined : onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-label={editing ? "Change category" : "New category"}
        className="fixed inset-x-0 bottom-0 z-[70] bg-card rounded-t-3xl max-h-dvh overflow-y-auto overscroll-contain text-text-primary"
      >
        <div className="mx-auto max-w-md px-6 pt-5 pb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold">{editing ? "Change category" : "New category"}</h2>
            <button type="button" onClick={onClose} disabled={saving} aria-label="Close" className="text-text-secondary disabled:opacity-40">
              <X className="size-5" />
            </button>
          </div>

          <label className="block text-xs font-medium text-text-secondary mb-1.5" htmlFor="category-name">
            Name
          </label>
          <input
            id="category-name"
            className="w-full h-12 rounded-xl bg-card ring-1 ring-hairline-strong px-4 text-sm placeholder:text-text-secondary focus:outline-none focus:ring-brand-teal disabled:opacity-60"
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
            maxLength={MAX_CATEGORY_NAME}
            placeholder="e.g. Job Materials"
            disabled={saving}
          />

          <fieldset className="mt-4" disabled={saving}>
            <legend className="text-xs font-medium text-text-secondary mb-2">Icon</legend>
            <div className="grid grid-cols-6 gap-2 justify-items-center max-h-56 overflow-y-auto p-1">
              {iconNames.map((key, i) => {
                const Icon = ICON_BANK[key];
                const selected = key === icon;
                return (
                  <button
                    key={key}
                    type="button"
                    aria-label={key}
                    aria-pressed={selected}
                    onClick={() => setIcon(key)}
                    className={`size-10 rounded-lg grid place-items-center ${TINTS[i % TINTS.length]} ${
                      selected ? "ring-2 ring-brand-teal" : ""
                    }`}
                  >
                    <Icon className="size-[18px]" aria-hidden="true" />
                  </button>
                );
              })}
            </div>
          </fieldset>

          <label className="block text-xs font-medium text-text-secondary mt-4 mb-1.5" htmlFor="category-gifi">
            GIFI category for your accountant
          </label>
          <select
            id="category-gifi"
            className="w-full h-12 rounded-xl bg-card ring-1 ring-hairline-strong px-3 text-sm disabled:opacity-60"
            value={gifi}
            onChange={(e) => setGifi(e.target.value)}
            disabled={saving}
          >
            {GIFI_CATEGORIES.map((c) => (
              <option key={c.code} value={c.code}>
                {c.code} {c.name}
              </option>
            ))}
          </select>

          {error && (
            <p className="text-sm text-danger mt-3" role="alert">
              {error}
            </p>
          )}

          <button
            type="button"
            onClick={submit}
            disabled={saving}
            className="w-full rounded-full bg-brand-teal py-3.5 font-semibold text-white hover:opacity-90 transition disabled:opacity-60 mt-4"
          >
            {saving ? busyText || "Saving…" : editing ? "Save changes" : "Save category"}
          </button>

          {children}
        </div>
      </div>
    </>
  );
}
