import { verifyCaller } from "../../../lib/server/firebaseAuth";
import { accountStatus, appUrl, billingEnabled, forgetStatus, stripeClient } from "../../../lib/server/billing";

// Stripe's own billing page: add or change the card, see invoices, cancel.
// { card: true } opens straight on adding a card (a trial with no card yet, or
// a payment that failed). Returns { url }.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const user = await verifyCaller(req);
  if (!user) return res.status(401).json({ error: "Please sign in again." });
  if (!billingEnabled()) return res.status(400).json({ error: "Payments aren't switched on yet." });
  try {
    const status = await accountStatus(user, { fresh: true });
    if (!status.customerId) return res.status(400).json({ error: "Your account doesn't need a plan." });
    const session = await stripeClient().billingPortal.sessions.create({
      customer: status.customerId,
      return_url: appUrl(req, "/settings?billing=back"),
      ...(req.body?.card ? { flow_data: { type: "payment_method_update" } } : {}),
    });
    forgetStatus(user.uid);
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("billing portal", err?.message);
    return res.status(500).json({ error: "We couldn't open your billing page. Please try again." });
  }
}
