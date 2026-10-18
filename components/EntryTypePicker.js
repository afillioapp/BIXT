import { ArrowDownLeft, ArrowUpRight } from "lucide-react";
import { ENTRY_TYPES } from "../lib/google";

// "Are you being invoiced, or are you invoicing?" (owner request 2026-10-17).
// Asked on every captured receipt and saved to the sheet's Type column as
// Expense or Income. Two big tappable cards rather than a dropdown: it's a
// question the owner must answer, so both answers stay in view.
//
// value is "Expense", "Income", or "" (not answered yet — capture starts
// here on purpose so nobody saves on autopilot). `missing` outlines the pair
// in red after a save attempt without an answer.
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

export default function EntryTypePicker({ value, onChange, disabled = false, missing = false }) {
  return (
    <fieldset disabled={disabled} className="min-w-0">
      <legend className={`text-sm mb-2 ${missing ? "text-destructive" : "text-text-secondary"}`}>
        {missing ? "Please choose one before saving" : "Money out or money in?"}
      </legend>
      <div className="grid grid-cols-2 gap-2.5" role="radiogroup">
        {OPTIONS.map(({ value: v, title, sub, Icon }) => {
          const selected = value === v;
          return (
            <button
              key={v}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => onChange(v)}
              className={`flex flex-col items-start gap-1 rounded-xl px-4 py-3 text-left transition disabled:opacity-60 ${
                selected
                  ? "bg-brand-teal-soft ring-2 ring-brand-teal"
                  : `bg-card ring-1 ${missing ? "ring-destructive" : "ring-hairline-strong"} hover:bg-muted`
              }`}
            >
              <Icon
                className={`size-4 ${selected ? "text-brand-teal-deep" : "text-text-secondary"}`}
                aria-hidden="true"
              />
              <span className="text-sm font-semibold text-text-primary leading-tight">{title}</span>
              <span className="text-[11px] text-text-secondary">{sub}</span>
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
