import { useCallback, useEffect, useState } from "react";

// The signed-in account's plan, from /api/billing/status (states in
// lib/billing.js). Remembered for a few minutes so moving between tabs doesn't
// ask again; refresh() asks Stripe fresh (after coming back from paying).
const CACHE_MS = 5 * 60 * 1000;
let remembered = null; // { uid, at, billing }

async function post(user, path, body = {}) {
  const idToken = await user.getIdToken();
  const res = await fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${idToken}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}

export function useBilling(user) {
  const uid = user?.uid;
  const fresh = remembered && remembered.uid === uid && Date.now() - remembered.at < CACHE_MS;
  const [billing, setBilling] = useState(fresh ? remembered.billing : null);

  const load = useCallback(
    async ({ force = false } = {}) => {
      if (!user) return;
      try {
        const next = await post(user, "/api/billing/status", force ? { fresh: true } : {});
        remembered = { uid: user.uid, at: Date.now(), billing: next };
        setBilling(next);
      } catch {
        setBilling({ state: "unknown" });
      }
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [uid]
  );

  useEffect(() => {
    if (!fresh) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [uid]);

  return { billing, refresh: () => load({ force: true }) };
}

// Sends the browser to Stripe: "subscribe" (checkout), "manage" (billing page)
// or "card" (billing page, straight to adding a card). Throws a plain message.
export async function goToStripe(user, kind) {
  const { url } =
    kind === "subscribe"
      ? await post(user, "/api/billing/checkout")
      : await post(user, "/api/billing/portal", { card: kind === "card" });
  remembered = null;
  window.location.assign(url);
}
