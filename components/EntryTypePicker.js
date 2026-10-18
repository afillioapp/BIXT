import { useId } from "react";
import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { ENTRY_TYPES } from "../lib/google";

// "Are you being invoiced, or are you invoicing?" (owner request 2026-10-17).
// Asked on every captured receipt and saved to the sheet's Type column as
// Expense or Income. Two big tappable cards rather than a dropdown: it's a
// question the owner must answer, so both answers stay in view.
//
// The cards are real radio inputs (visually hidden) inside labels, so the
// group gets the native radio behaviour for free: one Tab stop, arrow keys to
// move, and the fieldset's legend as its name.
//
// value is "Expense", "Income", or "" (not answered yet — capture starts
// here on purpose so nobody saves on autopilot). `missing` outlines the pair
// in red and adds an announced error line after a save attempt without an
// answer. `inputRef` points at the first radio so the caller can move focus
// here when Save is blocked.
const OPTIONS = [
  {
    value: ENTRY_TYPES.expense,
    title: "I'm being invoiced",
    sub: "I pay this",
    Icon: ArrowUpRight,
  },
  {
    value: ENTRY_TYPES.income,
    title: "I'm invoicing",
    sub: "I get paid",
    Icon: ArrowDownLeft,
  },
];

export default function EntryTypePicker({ value, onChange, disabled = false, missing = false, inputRef }) {
  const name = useId();
  const errorId = `${name}-error`;
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className="text-sm mb-2 text-text-secondary">Money out or money in?</legend>
      <div className="grid grid-cols-2 gap-2.5">
        {OPTIONS.map(({ value: v, title, sub, Icon }, i) => {
          const selected = value === v;
          return (
            <label
              key={v}
              className={`flex flex-col items-start gap-1 rounded-xl px-4 py-3 cursor-pointer transition has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-brand-teal has-[:disabled]:opacity-60 has-[:disabled]:cursor-default ${
                selected
                  ? "bg-brand-teal-soft ring-2 ring-brand-teal"
                  : `bg-card ring-1 ${missing ? "ring-destructive" : "ring-hairline-strong"} hover:bg-muted`
              }`}
            >
              <input
                ref={i === 0 ? inputRef : undefined}
                type="radio"
                name={name}
                value={v}
                checked={selected}
                onChange={() => onChange(v)}
                required
                aria-invalid={missing || undefined}
                aria-describedby={missing ? errorId : undefined}
                className="sr-only"
              />
              <Icon
                className={`size-4 ${selected ? "text-brand-teal-deep" : "text-text-secondary"}`}
                aria-hidden="true"
              />
              <span className="text-sm font-semibold text-text-primary leading-tight">{title}</span>
              <span className="text-[11px] text-text-secondary">{sub}</span>
            </label>
          );
        })}
      </div>
      {missing && (
        <p id={errorId} role="alert" className="mt-2 text-sm text-danger">
          Please choose one before saving.
        </p>
      )}
    </fieldset>
  );
}
