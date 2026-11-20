import { useId, useState } from "react";
import { Plus } from "lucide-react";
import CardEditor from "./CardEditor";
import { saveProfile, withFreshToken } from "../lib/google";
import { cardFields, cardLabel, freeCardKey, paymentCards } from "../lib/cards";

// "Which card or account paid for this?" (owner request 2026-11-20), or for
// money in, "Which account was this paid into?". The business's cards as
// tappable choices, plus "Add card or account", which saves one on the spot
// and picks it. value is the label written to the sheet ("Amex ••1234"), ""
// until chosen. `keep` is a receipt's existing card, shown even if it has since
// been removed or renamed. `missing` marks it red after a save without an answer.
//
// drive: { accessToken, refreshAccessToken, rootFolderId, profile, reloadProfile }
export default function CardPicker({ value, onChange, drive, type, legend, missing = false, disabled = false, inputRef }) {
  const name = useId();
  const errorId = `${name}-error`;
  const [adding, setAdding] = useState(false);
  // Shown right away, before the profile reload lands.
  const [added, setAdded] = useState({});
  const profile = { ...drive.profile, ...added };
  const labels = paymentCards(profile).map((c) => c.label);
  if (value && !labels.includes(value)) labels.push(value);
  const canAdd = !!freeCardKey(profile);

  async function createCard({ name: cardName, last4 }) {
    const key = freeCardKey(profile);
    if (!key) throw new Error("You've reached the limit of 8 cards and accounts.");
    const fields = cardFields(key, cardName, last4);
    try {
      await withFreshToken(drive.accessToken, drive.refreshAccessToken, (token) => saveProfile(token, drive.rootFolderId, fields));
    } catch {
      throw new Error("Couldn't save. Check your connection and try again.");
    }
    setAdded((a) => ({ ...a, ...fields }));
    drive.reloadProfile?.();
    onChange(cardLabel(cardName, last4));
    setAdding(false);
  }

  const question = legend || (type === "Income" ? "Which account was this paid into?" : "Which card or account paid for this?");

  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="text-sm mb-2 text-text-secondary">{question}</legend>
      {labels.length === 0 && (
        <p className="text-xs text-text-secondary mb-2">Add the cards and accounts you use. Only the last 4 digits are kept.</p>
      )}
      <div className="flex flex-wrap gap-2">
        {labels.map((label, i) => {
          const selected = value === label;
          return (
            <label
              key={label}
              className={`rounded-full px-3.5 py-2 text-sm cursor-pointer transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-teal has-[:disabled]:opacity-60 ${
                selected
                  ? "bg-brand-teal-soft ring-2 ring-brand-teal font-semibold text-text-primary"
                  : `bg-card ring-1 ${missing ? "ring-destructive" : "ring-hairline-strong"} text-text-primary hover:bg-muted`
              }`}
            >
              <input
                ref={i === 0 ? inputRef : undefined}
                type="radio"
                name={name}
                value={label}
                checked={selected}
                onChange={() => onChange(label)}
                aria-invalid={missing || undefined}
                aria-describedby={missing ? errorId : undefined}
                className="sr-only"
              />
              {label}
            </label>
          );
        })}
        {canAdd && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="inline-flex items-center gap-1 rounded-full px-3.5 py-2 text-sm font-semibold text-brand-teal-deep border border-dashed border-text-tertiary"
          >
            <Plus className="size-3.5" aria-hidden="true" />
            {labels.length ? "Add" : "Add card or account"}
          </button>
        )}
      </div>
      {missing && (
        <p id={errorId} role="alert" className="mt-2 text-sm text-danger">
          Please choose one before saving.
        </p>
      )}
      {adding && <CardEditor profile={profile} onSave={createCard} onClose={() => setAdding(false)} />}
    </fieldset>
  );
}
