import Stripe from "stripe";
import { TRIAL_DAYS } from "../billing.js";

// Who has paid, with Stripe as the only record (BX has no database). Each BX
// account is one Stripe customer, tagged with its Firebase uid. The first time
// an account is checked, it gets a customer and a free-trial subscription with
// no card; when the trial ends without a card, Stripe cancels it.
//
// Switched off until STRIPE_SECRET_KEY and STRIPE_PRICE_ID are set, so this
// code can ship before the Stripe account exists without locking anyone out.

export function billingEnabled() {
  return !!(process.env.STRIPE_SECRET_KEY && process.env.STRIPE_PRICE_ID);
}

let client = null;
export function stripeClient() {
  if (!client) client = new Stripe(process.env.STRIPE_SECRET_KEY);
  return client;
}

// Accounts the owner made free (their own, family, testers): emails, comma
// separated, in BX_FREE_ACCOUNTS. Only a verified email counts.
function isFreeAccount(user) {
  const list = String(process.env.BX_FREE_ACCOUNTS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return !!user.email && list.includes(user.email);
}

const LIVE = ["trialing", "active", "past_due"];

// The subscription that decides access: a live one if any, else the newest.
function pickSubscription(subs) {
  return subs.find((s) => LIVE.includes(s.status)) || subs[0] || null;
}

// Newer Stripe API versions moved the period end onto the subscription item.
function periodEnd(sub) {
  return sub.items?.data?.[0]?.current_period_end ?? sub.current_period_end ?? null;
}

const iso = (seconds) => (seconds ? new Date(seconds * 1000).toISOString() : null);

export function summarize(customer, sub) {
  const hasCard = !!(customer?.invoice_settings?.default_payment_method || sub?.default_payment_method);
  if (!sub) return { state: "ended", hasCard };
  if (sub.status === "trialing") return { state: "trial", trialEndsAt: iso(sub.trial_end), hasCard };
  if (sub.status === "active") {
    return {
      state: "active",
      renewsAt: sub.cancel_at_period_end ? null : iso(periodEnd(sub)),
      endsAt: sub.cancel_at_period_end ? iso(sub.cancel_at || periodEnd(sub)) : null,
      hasCard,
    };
  }
  if (sub.status === "past_due") return { state: "pastDue", hasCard };
  return { state: "ended", hasCard };
}

async function findCustomer(stripe, uid) {
  const found = await stripe.customers.search({ query: `metadata['firebaseUid']:'${uid}'`, limit: 1 });
  return found.data[0] || null;
}

// The customer and its deciding subscription, creating both on first use.
// Idempotency keys stop two quick first visits (Stripe's search can lag a
// minute behind a new customer) from making two customers or two trials.
export async function ensureAccount(stripe, user) {
  let customer = await findCustomer(stripe, user.uid);
  if (!customer) {
    customer = await stripe.customers.create(
      {
        email: user.email || undefined,
        phone: user.phone || undefined,
        metadata: { firebaseUid: user.uid },
      },
      { idempotencyKey: `bx-customer-${user.uid}` }
    );
  }
  const subs = (await stripe.subscriptions.list({ customer: customer.id, status: "all", limit: 10 })).data;
  if (subs.length) return { customer, subscription: pickSubscription(subs) };

  // Never had a plan: start the free trial. A trial is only ever given once.
  const subscription = await stripe.subscriptions.create(
    {
      customer: customer.id,
      items: [{ price: process.env.STRIPE_PRICE_ID }],
      trial_period_days: TRIAL_DAYS,
      trial_settings: { end_behavior: { missing_payment_method: "cancel" } },
      payment_settings: { save_default_payment_method: "on_subscription" },
      metadata: { firebaseUid: user.uid },
    },
    { idempotencyKey: `bx-trial-${user.uid}` }
  );
  return { customer, subscription };
}

// A few minutes per account per server, so reading a batch of receipts doesn't
// ask Stripe ten times. Cleared when the account changes its plan.
const CACHE_MS = 5 * 60 * 1000;
const cache = new Map();

export function forgetStatus(uid) {
  cache.delete(uid);
}

export async function accountStatus(user, { stripe = null, fresh = false } = {}) {
  if (!billingEnabled()) return { state: "off" };
  if (isFreeAccount(user)) return { state: "free" };
  const hit = cache.get(user.uid);
  if (!fresh && hit && Date.now() - hit.at < CACHE_MS) return hit.status;
  const s = stripe || stripeClient();
  const { customer, subscription } = await ensureAccount(s, user);
  const status = { ...summarize(customer, subscription), customerId: customer.id };
  cache.set(user.uid, { at: Date.now(), status });
  return status;
}

// Where Stripe sends people back to: this app, whatever domain it's on.
export function appUrl(req, path) {
  const base = process.env.BX_APP_URL || `https://${req.headers.host}`;
  return `${base.replace(/\/$/, "")}${path}`;
}
