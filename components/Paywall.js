import { useState } from "react";
import { goToStripe } from "../lib/useBilling";
import { PRICE_LABEL } from "../lib/billing";

// Shown instead of the camera once a trial or plan has ended (owner decision
// 2026-11-25: only new receipts stop). Everything else in the app still works.
export default function Paywall({ user, trial }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function subscribe() {
    setError("");
    setBusy(true);
    try {
      await goToStripe(user, "subscribe");
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  return (
    <div className="bg-card ring-1 ring-hairline rounded-2xl p-6 flex flex-col items-center gap-3 text-center">
      <p className="text-base font-semibold">{trial ? "Your free trial has ended" : "Your plan has ended"}</p>
      <p className="text-sm text-text-secondary leading-relaxed max-w-[280px]">
        Subscribe for {PRICE_LABEL} to keep adding receipts. Everything you've saved stays in your Google Drive.
      </p>
      <button
        type="button"
        onClick={subscribe}
        disabled={busy}
        className="w-full mt-2 rounded-full bg-brand-teal py-3.5 font-semibold text-white hover:opacity-90 transition disabled:opacity-60"
      >
        {busy ? "Opening…" : `Subscribe · ${PRICE_LABEL}`}
      </button>
      <p className="text-[11px] text-text-tertiary">Cancel any time in Settings.</p>
      {error && (
        <p className="text-sm text-danger" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}
