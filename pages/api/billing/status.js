import { verifyCaller } from "../../../lib/server/firebaseAuth";
import { accountStatus } from "../../../lib/server/billing";

// The signed-in account's plan (see lib/billing.js for the states). The first
// call for a new account starts its free trial, so it's a POST.
export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: "Method not allowed" });
  const user = await verifyCaller(req);
  if (!user) return res.status(401).json({ error: "Please sign in again." });
  try {
    const { customerId, ...status } = await accountStatus(user, { fresh: !!req.body?.fresh });
    return res.status(200).json(status);
  } catch (err) {
    console.error("billing status", err?.message);
    // Stripe being down mustn't stop a paying customer: say nothing is known.
    return res.status(200).json({ state: "unknown" });
  }
}
