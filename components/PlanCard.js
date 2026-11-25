import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { BadgeCheck } from "lucide-react";
import { useBilling, goToStripe } from "../lib/useBilling";
import { PRICE_LABEL, daysLeft } from "../lib/billing";

// Settings > Plan: where the free trial stands, and the one button that fits
// (add a card, subscribe, or manage billing on Stripe's own page). Hidden when
// payments aren't switched on, or the account is one the owner made free.
const fmt = (iso) => new Date(iso).toLocaleDateString("en-US", { month: "long", day: "numeric" });

export default function PlanCard({ user }) {
  const router = useRouter();
  const { billing, refresh } = useBilling(user);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [thanks, setThanks] = useState(false);

  // Back from Stripe: ask again, since the plan may have just changed.
  useEffect(() => {
    if (!router.query.billing) return;
    if (router.query.billing === "done") setThanks(true);
    refresh();
    router.replace("/settings", undefined, { shallow: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [router.query.billing]);

  if (!billing || ["off", "free", "unknown"].includes(billing.state)) return null;

  async function go(kind) {
    setError("");
    setBusy(true);
    try {
      await goToStripe(user, kind);
    } catch (err) {
      setError(err.message);
      setBusy(false);
    }
  }

  let title = "";
  let detail = "";
  let action = null;
  const left = daysLeft(billing.trialEndsAt);
  if (billing.state === "trial") {
    title = `Free trial · ${left} day${left === 1 ? "" : "s"} left`;
    if (billing.hasCard) {
      detail = `Then ${PRICE_LABEL} on your card, starting ${fmt(billing.trialEndsAt)}.`;
      action = { label: "Manage billing", kind: "manage" };
    } else {
      detail = `Then ${PRICE_LABEL}. Add a card before ${fmt(billing.trialEndsAt)} to keep adding receipts.`;
      action = { label: "Add a card", kind: "card", primary: true };
    }
  } else if (billing.state === "active") {
    title = `BX · ${PRICE_LABEL}`;
    detail = billing.endsAt ? `Cancelled. BX keeps working until ${fmt(billing.endsAt)}.` : billing.renewsAt ? `Next payment ${fmt(billing.renewsAt)}.` : "";
    action = { label: "Manage billing", kind: "manage" };
  } else if (billing.state === "pastDue") {
    title = "Your last payment didn't go through";
    detail = "Update your card to keep adding receipts.";
    action = { label: "Update card", kind: "card", primary: true };
  } else {
    title = "Your plan has ended";
    detail = `Subscribe for ${PRICE_LABEL} to keep adding receipts. Everything you've saved stays in your Google Drive.`;
    action = { label: `Subscribe · ${PRICE_LABEL}`, kind: "subscribe", primary: true };
  }

  return (
    <section id="plan" aria-label="Your plan" className="bg-card ring-1 ring-hairline rounded-2xl p-4 mb-6">
      <div className="flex items-center gap-3">
        <BadgeCheck className="size-4 text-text-secondary shrink-0" aria-hidden="true" />
        <p className={`flex-1 min-w-0 text-sm font-semibold ${billing.state === "pastDue" || billing.state === "ended" ? "text-danger" : ""}`}>{title}</p>
      </div>
      {detail && <p className="text-xs text-text-secondary mt-1">{detail}</p>}
      {thanks && billing.state === "active" && (
        <p className="text-sm text-brand-teal-deep mt-2" role="status">
          Thank you! You're subscribed.
        </p>
      )}
      {action && (
        <button
          type="button"
          onClick={() => go(action.kind)}
          disabled={busy}
          className={`w-full mt-3 h-10 rounded-full text-sm font-semibold disabled:opacity-60 ${
            action.primary ? "bg-brand-teal text-white" : "ring-1 ring-hairline-strong"
          }`}
        >
          {busy ? "Opening…" : action.label}
        </button>
      )}
      {error && (
        <p className="text-sm text-danger mt-2" role="alert">
          {error}
        </p>
      )}
    </section>
  );
}
