// The plan BX sells (owner decisions 2026-11-25): a 14-day free trial that
// starts by itself, no card needed, then $2.99 CAD a month. When a trial ends
// or payment stops, only new receipts stop; everything saved stays in the
// owner's Drive. The price itself lives in Stripe (STRIPE_PRICE_ID); these are
// the words the app shows.
export const TRIAL_DAYS = 14;
export const PRICE_LABEL = "$2.99/month";

// What the app may do for an account, from /api/billing/status:
//   off     billing isn't switched on (no Stripe keys): everyone can use BX
//   free    an account the owner made free (BX_FREE_ACCOUNTS)
//   trial   in the free trial
//   active  paying
//   pastDue the last payment failed; still works while Stripe retries
//   ended   trial over or plan cancelled: no new receipts
export function canAddReceipts(billing) {
  return !billing || billing.state !== "ended";
}

export function daysLeft(isoDate, now = new Date()) {
  if (!isoDate) return null;
  return Math.max(0, Math.ceil((new Date(isoDate) - now) / 86400000));
}
