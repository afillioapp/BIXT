import Link from "next/link";
import { useBilling } from "../lib/useBilling";
import { daysLeft } from "../lib/billing";

// A one-line heads-up on Home: a trial with no card ending within 3 days, a
// failed payment, or an ended plan. Links to Settings > Plan. Nothing otherwise.
export default function PlanBanner({ user }) {
  const { billing } = useBilling(user);
  if (!billing) return null;
  let text = "";
  const left = daysLeft(billing.trialEndsAt);
  if (billing.state === "trial" && !billing.hasCard && left <= 3) {
    text = left === 0 ? "Your free trial ends today. Add a card to keep going." : `Your free trial ends in ${left} day${left === 1 ? "" : "s"}. Add a card to keep going.`;
  } else if (billing.state === "pastDue") {
    text = "Your last payment didn't go through. Update your card.";
  } else if (billing.state === "ended") {
    text = "Your plan has ended. Subscribe to keep adding receipts.";
  }
  if (!text) return null;
  return (
    <Link href="/settings#plan" className="block mb-4 rounded-2xl bg-brand-teal-soft px-4 py-3 text-sm font-medium text-brand-teal-deep">
      {text}
    </Link>
  );
}
