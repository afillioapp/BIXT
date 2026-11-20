import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { cardProblem, MAX_CARD_NAME } from "../lib/cards";

// Bottom sheet for adding or changing one of the business's cards or accounts:
// a name and, optionally, the last 4 digits. `children` is extra content under
// Save (Settings puts Remove there). onSave({ name, last4 }) may reject; the
// error shows here and the sheet stays open.
export default function CardEditor({ initial, profile, onSave, onClose, children }) {
  const editing = !!initial;
  const [name, setName] = useState(initial?.name || "");
  const [last4, setLast4] = useState(initial?.last4 || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    setName(initial?.name || "");
    setLast4(initial?.last4 || "");
    setError("");
  }, [initial]);

  async function submit() {
    const problem = cardProblem(name, last4, profile, initial?.key || "");
    if (problem) {
      setError(problem);
      return;
    }
    setSaving(true);
    setError("");
    try {
      await onSave({ name: name.trim(), last4 });
    } catch (err) {
      setError(err?.message || "Couldn't save. Check your connection and try again.");
      setSaving(false);
    }
  }

  const field =
    "w-full h-12 rounded-xl bg-card ring-1 ring-hairline-strong px-4 text-sm placeholder:text-text-secondary focus:outline-none focus:ring-brand-teal disabled:opacity-60";

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={saving ? undefined : onClose} aria-hidden="true" />
      <div
        role="dialog"
        aria-label={editing ? "Change card or account" : "New card or account"}
        className="fixed inset-x-0 bottom-0 z-[70] bg-card rounded-t-3xl max-h-dvh overflow-y-auto overscroll-contain text-text-primary"
      >
        <div className="mx-auto max-w-md px-6 pt-5 pb-8">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-base font-semibold">{editing ? "Change card or account" : "New card or account"}</h2>
            <button type="button" onClick={onClose} disabled={saving} aria-label="Close" className="text-text-secondary disabled:opacity-40">
              <X className="size-5" />
            </button>
          </div>

          <label className="block text-xs font-medium text-text-secondary mb-1.5" htmlFor="card-name">
            Name
          </label>
          <input
            id="card-name"
            className={field}
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              setError("");
            }}
            maxLength={MAX_CARD_NAME}
            placeholder="e.g. Amex or TD debit"
            disabled={saving}
          />

          <label className="block text-xs font-medium text-text-secondary mt-4 mb-1.5" htmlFor="card-last4">
            Last 4 digits (optional)
          </label>
          <input
            id="card-last4"
            className={field}
            value={last4}
            onChange={(e) => {
              // A pasted full number keeps only its LAST four digits.
              setLast4(e.target.value.replace(/\D/g, "").slice(-4));
              setError("");
            }}
            onKeyDown={(e) => e.key === "Enter" && submit()}
            inputMode="numeric"
            placeholder="1234"
            disabled={saving}
          />
          <p className="mt-1.5 text-[11px] text-text-secondary">Only the last 4 digits are kept, never the full number.</p>

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
            {saving ? "Saving…" : editing ? "Save changes" : "Save"}
          </button>

          {children}
        </div>
      </div>
    </>
  );
}
