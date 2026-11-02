import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ChevronRight, Lock } from "lucide-react";
import { useDrive } from "../lib/useDrive";
import { saveProfile, findCategoryRows, moveCategoryRows, withFreshToken } from "../lib/google";
import {
  BUILTIN_CATEGORIES,
  HIDDEN_CATEGORIES_KEY,
  MAX_CUSTOM_CATEGORIES,
  OTHER_CATEGORY,
  customCategories,
  encodeCustomCategory,
  encodeHiddenCategories,
  freeCategoryKey,
  gifiCodeFor,
  hiddenCategories,
  pickerCategories,
  registerCustomCategories,
} from "../lib/categories";
import CategoryIcon, { tintForCategory } from "../components/CategoryIcon";
import CategoryEditor from "../components/CategoryEditor";
import DriveFallback from "../components/DriveFallback";
import PageHeader from "../components/PageHeader";
import { scheduleReportRefresh } from "../lib/reportQueue";

// Settings > Categories (owner request 2026-11-02): add the business's own
// categories with an icon, change or remove them, and hide built-ins it never
// uses. Hiding only affects the picker; old receipts keep their category.
// Removing or renaming one of your own moves its receipts across every month,
// so a category that no longer exists never lingers in the books.

const SAVE_FAILED = "Couldn't save. Check your connection and try again.";

function Toggle({ on, onClick, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      onClick={onClick}
      className={`w-12 h-7 rounded-full relative shrink-0 transition-colors ${on ? "bg-brand-teal" : "bg-track"}`}
    >
      <span className={`absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow transition-transform ${on ? "translate-x-5" : ""}`} />
    </button>
  );
}

export default function Categories({ user }) {
  const drive = useDrive(user);
  const { accessToken, refreshAccessToken, rootFolderId, profile, profileLoading, needsConnect, loadError, requestAccess, retryConnection, reloadProfile } = drive;

  const [editor, setEditor] = useState(null); // null | { category } (category null = new)
  const [busyText, setBusyText] = useState("");
  const [status, setStatus] = useState(null);
  // Removing: { phase: "checking" | "confirm" | "moving", plan, count, to, error }
  const [removal, setRemoval] = useState(null);

  // Hidden built-ins follow taps instantly; saves run in order behind them.
  const [hidden, setHidden] = useState([]);
  const hiddenPending = useRef(0);
  const hiddenChain = useRef(Promise.resolve());
  const savedHidden = String(profile?.[HIDDEN_CATEGORIES_KEY] || "");
  useEffect(() => {
    if (hiddenPending.current === 0) setHidden(hiddenCategories(profile));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [savedHidden]);

  const run = (fn) => withFreshToken(accessToken, refreshAccessToken, fn);

  if (profileLoading || !profile) {
    return (
      <div className="min-h-screen bg-background font-sans text-text-primary pb-28">
        <PageHeader>
          <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
        </PageHeader>
        <div className="mx-auto max-w-md px-5 pt-6">
          <DriveFallback needsConnect={needsConnect} loadError={loadError} onConnect={requestAccess} onRetry={retryConnection} />
        </div>
      </div>
    );
  }

  const customs = customCategories(profile);

  async function saveCategoryFields(fields) {
    await run((token) => saveProfile(token, rootFolderId, fields));
    registerCustomCategories({ ...profile, ...fields });
    await reloadProfile?.();
    // A new code or a moved receipt changes the accountant's report.
    scheduleReportRefresh({ accessToken, refreshAccessToken, rootFolderId, profile: { ...profile, ...fields } }, { full: true });
  }

  async function handleSave({ name, icon, gifi }) {
    const current = editor?.category;
    try {
      if (!current) {
        const key = freeCategoryKey(profile);
        if (!key) throw new Error(`You've reached the limit of ${MAX_CUSTOM_CATEGORIES} of your own categories.`);
        await saveCategoryFields({ [key]: encodeCustomCategory(name, icon, gifi) });
        setStatus({ type: "success", text: `Added "${name}".` });
      } else {
        // Renaming moves its receipts first. If that fails part-way, saving
        // again simply finishes the rest.
        if (name !== current.name) {
          setBusyText("Updating your receipts…");
          await run(async (token) => {
            const plan = await findCategoryRows(token, rootFolderId, current.name);
            await moveCategoryRows(token, plan, name);
          });
        }
        await saveCategoryFields({ [current.key]: encodeCustomCategory(name, icon, gifi) });
        setStatus({ type: "success", text: `Saved "${name}".` });
      }
      setEditor(null);
    } catch (err) {
      throw new Error(/limit/.test(err?.message || "") ? err.message : SAVE_FAILED);
    } finally {
      setBusyText("");
    }
  }

  async function startRemove(cat) {
    setRemoval({ phase: "checking" });
    try {
      const plan = await run((token) => findCategoryRows(token, rootFolderId, cat.name));
      const count = plan.reduce((n, p) => n + p.cells.length, 0);
      if (count === 0) {
        await finishRemove(cat);
        return;
      }
      setRemoval({ phase: "confirm", plan, count, to: OTHER_CATEGORY });
    } catch {
      setRemoval({ phase: "error", error: SAVE_FAILED });
    }
  }

  async function finishRemove(cat) {
    await saveCategoryFields({ [cat.key]: "" });
    setRemoval(null);
    setEditor(null);
    setStatus({ type: "success", text: `Removed "${cat.name}".` });
  }

  async function confirmRemove(cat) {
    const { plan, to, count } = removal;
    setRemoval({ ...removal, phase: "moving", error: "" });
    try {
      await run((token) => moveCategoryRows(token, plan, to));
      await finishRemove(cat);
      setStatus({ type: "success", text: `Removed "${cat.name}" and moved ${count} receipt${count === 1 ? "" : "s"} to ${to}.` });
    } catch {
      setRemoval({ ...removal, phase: "confirm", error: `${SAVE_FAILED} Nothing is lost; tap again to finish.` });
    }
  }

  function toggleBuiltin(name) {
    const next = hidden.includes(name) ? hidden.filter((n) => n !== name) : [...hidden, name];
    setHidden(next);
    setStatus(null);
    hiddenPending.current += 1;
    hiddenChain.current = hiddenChain.current.then(async () => {
      let failed = false;
      try {
        await run((token) => saveProfile(token, rootFolderId, { [HIDDEN_CATEGORIES_KEY]: encodeHiddenCategories(next) }));
      } catch {
        failed = true;
      }
      hiddenPending.current -= 1;
      if (hiddenPending.current > 0) return;
      if (failed) {
        setHidden(hiddenCategories(profile));
        setStatus({ type: "error", text: SAVE_FAILED });
      }
      reloadProfile?.();
    });
  }

  const editing = editor?.category;
  const moveTargets = editing ? pickerCategories(profile).filter((c) => c !== editing.name) : [];

  return (
    <div className="min-h-screen bg-background font-sans text-text-primary pb-28">
      <PageHeader>
        <div className="flex items-center gap-3">
          <Link href="/settings" aria-label="Back to Settings" className="text-text-secondary -ml-1">
            <ArrowLeft className="size-5" />
          </Link>
          <h1 className="text-2xl font-semibold tracking-tight">Categories</h1>
        </div>
      </PageHeader>

      <div className="mx-auto max-w-md px-5 pt-6 flex flex-col gap-3">
        <button
          type="button"
          onClick={() => {
            setStatus(null);
            setEditor({ category: null });
          }}
          disabled={customs.length >= MAX_CUSTOM_CATEGORIES}
          className="w-full rounded-full bg-brand-teal py-3.5 font-semibold text-white hover:opacity-90 transition disabled:opacity-60"
        >
          + Add a category
        </button>

        <p role="status" className={status ? `text-sm ${status.type === "error" ? "text-danger" : "text-brand-teal-deep"}` : "sr-only"}>
          {status?.text || ""}
        </p>

        <h2 className="text-[11px] font-semibold tracking-wider text-text-secondary mt-2">YOUR CATEGORIES</h2>
        {customs.length === 0 ? (
          <p className="text-sm text-text-secondary">
            Add the things your business buys often, like Job Materials or Subcontractors.
          </p>
        ) : (
          <div className="bg-card ring-1 ring-hairline rounded-2xl divide-y divide-hairline overflow-hidden">
            {customs.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => {
                  setStatus(null);
                  setRemoval(null);
                  setEditor({ category: c });
                }}
                className="w-full flex items-center gap-3 p-3 text-left"
              >
                <span className={`size-10 rounded-lg grid place-items-center shrink-0 ${tintForCategory(c.name)}`}>
                  <CategoryIcon category={c.name} className="size-4" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="block text-sm font-medium truncate">{c.name}</span>
                  <span className="block text-[11px] text-text-secondary">GIFI {gifiCodeFor(c.name, profile)}</span>
                </span>
                <ChevronRight className="size-4 text-text-tertiary shrink-0" />
              </button>
            ))}
          </div>
        )}

        <h2 className="text-[11px] font-semibold tracking-wider text-text-secondary mt-2">GIFI CATEGORIES</h2>
        <p className="text-xs text-text-secondary -mt-1">Turn off the ones you never use. Old receipts keep their category.</p>
        <div className="bg-card ring-1 ring-hairline rounded-2xl divide-y divide-hairline overflow-hidden">
          {BUILTIN_CATEGORIES.map((c) => (
            <div key={c} className="flex items-center gap-3 p-3">
              <span className={`size-10 rounded-lg grid place-items-center shrink-0 ${tintForCategory(c)}`}>
                <CategoryIcon category={c} className="size-4" />
              </span>
              <span className="flex-1 min-w-0">
                <span className={`block text-sm font-medium truncate ${hidden.includes(c) ? "text-text-tertiary" : ""}`}>{c}</span>
                <span className="block text-[11px] text-text-secondary">{gifiCodeFor(c, profile) ? `GIFI ${gifiCodeFor(c, profile)}` : "No GIFI code, not an expense"}</span>
              </span>
              {c === OTHER_CATEGORY ? (
                <Lock className="size-4 text-text-tertiary shrink-0 mr-4" aria-label="Always available" />
              ) : (
                <Toggle on={!hidden.includes(c)} onClick={() => toggleBuiltin(c)} label={`Show ${c}`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {editor && (
        <CategoryEditor
          initial={editing}
          profile={profile}
          onSave={handleSave}
          onClose={() => {
            setEditor(null);
            setRemoval(null);
          }}
          busyText={busyText}
        >
          {editing && !removal && (
            <button type="button" onClick={() => startRemove(editing)} className="w-full mt-3 py-2 text-sm font-medium text-destructive">
              Remove category
            </button>
          )}
          {editing && removal?.phase === "checking" && (
            <p className="mt-3 text-sm text-text-secondary text-center" role="status">
              Checking your receipts…
            </p>
          )}
          {editing && removal?.phase === "error" && (
            <p className="mt-3 text-sm text-danger" role="alert">
              {removal.error}
            </p>
          )}
          {editing && (removal?.phase === "confirm" || removal?.phase === "moving") && (
            <div className="mt-4 rounded-2xl ring-1 ring-hairline p-4">
              <p className="text-sm font-medium mb-1">
                {removal.count} receipt{removal.count === 1 ? " uses" : "s use"} {editing.name}.
              </p>
              <label className="block text-xs text-text-secondary mb-1.5" htmlFor="move-to">
                Move {removal.count === 1 ? "it" : "them"} to:
              </label>
              <select
                id="move-to"
                value={removal.to}
                onChange={(e) => setRemoval({ ...removal, to: e.target.value })}
                disabled={removal.phase === "moving"}
                className="w-full h-11 rounded-xl bg-card ring-1 ring-hairline-strong px-3 text-sm mb-3"
              >
                {moveTargets.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
              {removal.error && (
                <p className="text-sm text-danger mb-2" role="alert">
                  {removal.error}
                </p>
              )}
              <button
                type="button"
                onClick={() => confirmRemove(editing)}
                disabled={removal.phase === "moving"}
                className="w-full h-10 rounded-full bg-destructive text-white text-sm font-semibold disabled:opacity-60"
              >
                {removal.phase === "moving" ? "Moving…" : "Move and remove"}
              </button>
            </div>
          )}
        </CategoryEditor>
      )}
    </div>
  );
}
