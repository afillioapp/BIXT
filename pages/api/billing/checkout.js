import { verifyCaller } from "../../../lib/server/firebaseAuth";
import { accountStatus, appUrl, billingEnabled, forgetStatus, stripeClient } from "../../../lib/server/billing";

// Starts paying: a Stripe Checkout page for the $2.99/month plan, for an
// account whose trial or plan has ended. Returns { url } to send the browser to.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const user = await verifyCaller(req);
  if (!user) return res.status(401).json({ error: "Please sign in again." });
  if (!billingEnabled()) return res.status(400).json({ error: "Payments aren't switched on yet." });
  try {
    const status = await accountStatus(user, { fresh: true });
    if (!status.customerId) return res.status(400).json({ error: "Your account doesn't need a plan." });
    const session = await stripeClient().checkout.sessions.create({
      mode: "subscription",
      customer: status.customerId,
      line_items: [{ price: process.env.STRIPE_PRICE_ID, quantity: 1 }],
      subscription_data: { metadata: { firebaseUid: user.uid } },
      allow_promotion_codes: true,
      ...(process.env.STRIPE_AUTOMATIC_TAX === "true"
        ? { automatic_tax: { enabled: true }, customer_update: { address: "auto" } }
        : {}),
      success_url: appUrl(req, "/settings?billing=done"),
      cancel_url: appUrl(req, "/settings"),
    });
    forgetStatus(user.uid);
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error("billing checkout", err?.message);
    return res.status(500).json({ error: "We couldn't open the payment page. Please try again." });
  }
}
