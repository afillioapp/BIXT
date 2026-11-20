// The cards and bank accounts a business pays from and gets paid into (owner
// request 2026-11-20: "most people have two or three cards"). Every receipt
// records which one, so the accountant can match it to a statement.
//
// Stored on the company folder like the rest of the profile, but as Drive
// appProperties (card0..card7 = "1234|Amex"), which only this app can read:
// the public properties are nearly full, and the last 4 digits needn't be
// visible to anyone else. Only ever the last 4 digits, never a full number.
//
// The bank account entered at setup (bankName + bankLast4) counts as the first
// one, under the key "bank", so nobody has to type it again.

export const MAX_CARDS = 8;
export const MAX_CARD_NAME = 30;
export const CARD_KEYS = Array.from({ length: MAX_CARDS }, (_, i) => `card${i}`);
const LEGACY_KEY = "bank";

// What a receipt's "Card or account" cell says, e.g. "Amex ••1234".
export function cardLabel(name, last4) {
  const clean = String(name || "").trim();
  return last4 ? `${clean} ••${last4}`.trim() : clean;
}

// [{ key, name, last4, label }], the bank from setup first.
export function paymentCards(profile) {
  const out = [];
  if (profile?.bankName || profile?.bankLast4) {
    const name = profile.bankName || "Bank account";
    out.push({ key: LEGACY_KEY, name, last4: profile.bankLast4 || "", label: cardLabel(name, profile.bankLast4) });
  }
  for (const key of CARD_KEYS) {
    const raw = profile?.[key];
    if (!raw) continue;
    const bar = raw.indexOf("|");
    const last4 = bar === -1 ? "" : raw.slice(0, bar);
    const name = bar === -1 ? raw : raw.slice(bar + 1);
    out.push({ key, name, last4, label: cardLabel(name, last4) });
  }
  return out;
}

export function freeCardKey(profile) {
  return CARD_KEYS.find((k) => !profile?.[k]) || null;
}

// The profile fields that save (or, with blank name and digits, remove) a card.
export function cardFields(key, name, last4) {
  const clean = String(name || "").trim();
  if (key === LEGACY_KEY) return { bankName: clean, bankLast4: last4 || "" };
  return { [key]: clean || last4 ? `${last4 || ""}|${clean}` : "" };
}

// An error sentence, or "" if fine. `ignoreKey` is the card being changed.
export function cardProblem(name, last4, profile, ignoreKey = "") {
  const clean = String(name || "").trim();
  if (!clean) return "Give it a name, like Amex or TD debit.";
  if (clean.length > MAX_CARD_NAME) return `Keep the name under ${MAX_CARD_NAME} characters.`;
  // These characters would make a spreadsheet treat the name as a formula.
  if (/^[=+@-]/.test(clean)) return "The name can't start with = + @ or -.";
  if (clean.includes("|")) return "The name can't contain |.";
  if (last4 && !/^\d{4}$/.test(last4)) return "Enter exactly the last 4 digits, or leave it blank.";
  const label = cardLabel(clean, last4).toLowerCase();
  if (paymentCards(profile).some((c) => c.key !== ignoreKey && c.label.toLowerCase() === label)) return "You already have this one.";
  return "";
}
