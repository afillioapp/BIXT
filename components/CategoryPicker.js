import { useState } from "react";
import { ChevronDown, Check, X } from "lucide-react";
import CategoryIcon, { tintForCategory } from "./CategoryIcon";
import CategoryEditor from "./CategoryEditor";
import { saveProfile, withFreshToken } from "../lib/google";
import {
  customCategories,
  encodeCustomCategory,
  freeCategoryKey,
  gifiCodeFor,
  pickerCategories,
  registerCustomCategories,
} from "../lib/categories";

// The category field on a receipt (capture and Edit sheet). Tapping it opens a
// list with each category's icon: the owner's own first, then the built-ins
// they haven't hidden, then "+ New category…", which adds one on the spot and
// selects it.
//
// drive: { accessToken, refreshAccessToken, rootFolderId, profile, reloadProfile }
export default function CategoryPicker({ value, onChange, drive, disabled = false }) {
  const [open, setOpen] = useState(false);
  const [adding, setAdding] = useState(false);
  // Shown right away, before the profile reload lands.
  const [added, setAdded] = useState({});
  const profile = { ...drive.profile, ...added };
  const options = pickerCategories(profile, value);
  const ownNames = new Set(customCategories(profile).map((c) => c.name));
  const canAdd = !!freeCategoryKey(profile);

  async function createCategory({ name, icon, gifi }) {
    const key = freeCategoryKey(profile);
    if (!key) throw new Error("You've reached the limit of 20 of your own categories.");
    const fields = { [key]: encodeCustomCategory(name, icon, gifi) };
    try {
      await withFreshToken(drive.accessToken, drive.refreshAccessToken, (token) =>
        saveProfile(token, drive.rootFolderId, fields)
      );
    } catch {
      throw new Error("Couldn't save. Check your connection and try again.");
    }
    setAdded((a) => ({ ...a, ...fields }));
    registerCustomCategories({ ...profile, ...fields });
    drive.reloadProfile?.();
    onChange(name);
    setAdding(false);
    setOpen(false);
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-label={`Category: ${value}`}
        className="w-full h-12 rounded-xl bg-card ring-1 ring-hairline-strong pl-2 pr-4 text-sm text-text-primary flex items-center gap-2.5 text-left disabled:opacity-60"
      >
        <span className={`size-8 rounded-lg grid place-items-center shrink-0 ${tintForCategory(value)}`}>
          <CategoryIcon category={value} className="size-4" />
        </span>
        <span className="flex-1 min-w-0 truncate">{value}</span>
        <ChevronDown className="size-4 text-text-tertiary shrink-0" aria-hidden="true" />
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[60] bg-black/40" onClick={() => setOpen(false)} aria-hidden="true" />
          <div
            role="dialog"
            aria-label="Choose a category"
            className="fixed inset-x-0 bottom-0 z-[65] bg-card rounded-t-3xl max-h-[80dvh] flex flex-col text-text-primary"
          >
            <div className="mx-auto w-full max-w-md px-6 pt-5 pb-2 flex items-center justify-between">
              <h2 className="text-base font-semibold">Category</h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="Close" className="text-text-secondary">
                <X className="size-5" />
              </button>
            </div>
            <ul className="mx-auto w-full max-w-md px-4 pb-6 overflow-y-auto overscroll-contain">
              {options.map((c) => {
                const code = gifiCodeFor(c, profile);
                const small = [ownNames.has(c) ? "Yours" : "", code ? `GIFI ${code}` : "No GIFI code, not an expense"].filter(Boolean).join(" · ");
                return (
                <li key={c}>
                  <button
                    type="button"
                    onClick={() => {
                      onChange(c);
                      setOpen(false);
                    }}
                    className="w-full flex items-center gap-3 rounded-xl px-2 py-2 text-left hover:bg-muted"
                  >
                    <span className={`size-9 rounded-lg grid place-items-center shrink-0 ${tintForCategory(c)}`}>
                      <CategoryIcon category={c} className="size-4" />
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-sm truncate">{c}</span>
                      <span className="block text-[11px] text-text-secondary">{small}</span>
                    </span>
                    {c === value && <Check className="size-4 text-brand-teal-deep shrink-0" aria-hidden="true" />}
                  </button>
                </li>
                );
              })}
              {canAdd && (
                <li>
                  <button
                    type="button"
                    onClick={() => setAdding(true)}
                    className="w-full rounded-xl px-2 py-3 text-left text-sm font-semibold text-brand-teal-deep hover:bg-muted"
                  >
                    + New category…
                  </button>
                </li>
              )}
            </ul>
          </div>
        </>
      )}

      {adding && <CategoryEditor profile={profile} onSave={createCategory} onClose={() => setAdding(false)} />}
    </>
  );
}
