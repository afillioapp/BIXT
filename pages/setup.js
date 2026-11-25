import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { Check, ChevronDown, Cloud } from "lucide-react";
import { useDrive } from "../lib/useDrive";
import {
  getCompanyRootFolderId,
  findExistingCompanyRootFolder,
  shareWithEmail,
  saveProfile,
  ensureMonthFolders,
} from "../lib/google";
import { MONTH_NAMES } from "../lib/insights";
import { fiscalYearNumber, yearFileName } from "../lib/annualReport";
import { useBilling } from "../lib/useBilling";
import { PRICE_LABEL, TRIAL_DAYS } from "../lib/billing";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputClass =
  "w-full h-12 rounded-xl bg-card ring-1 ring-hairline-strong px-4 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-brand-teal disabled:opacity-60";

// First-time setup, as two numbered steps (owner request 2026-11-25):
//   1. Connect Google Drive. Google opens on the account they just signed in
//      with (lib/useDrive.js passes it as a hint).
//   2. The business: only the company name is required. The accountant can be
//      added later in Settings, and cards are asked on the first receipt.
// Sharing with an accountant still needs an explicit "Yes, share" (audit #10).
// It ends on the first receipt, not an empty Home page.
function Steps({ step }) {
  return (
    <div className="mb-6">
      <p className="text-xs font-medium text-text-secondary mb-2">Step {step} of 2</p>
      <div className="flex gap-1.5" aria-hidden="true">
        {[1, 2].map((n) => (
          <span key={n} className={`h-1 flex-1 rounded-full ${n <= step ? "bg-brand-teal" : "bg-track"}`} />
        ))}
      </div>
    </div>
  );
}

export default function Setup({ user }) {
  const router = useRouter();
  const { accessToken, profile, profileLoading, needsConnect, loadError, requestAccess, retryConnection } = useDrive(user);

  const [companyName, setCompanyName] = useState("");
  const [accountantEmail, setAccountantEmail] = useState("");
  const [fiscalYearStart, setFiscalYearStart] = useState("1");
  const [creating, setCreating] = useState(false);
  const [done, setDone] = useState(null); // { yearly } once set up
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const emailInputRef = useRef(null);
  // Asking for the plan starts the free trial for a new account.
  const { billing } = useBilling(done ? user : null);

  // Already set up? Don't let them redo it by mistake.
  useEffect(() => {
    if (!profileLoading && profile && !done) router.replace("/");
  }, [profileLoading, profile, done]);

  function handleFinish() {
    if (!companyName.trim() || !accessToken) return;
    const email = accountantEmail.trim();
    if (email && !EMAIL_RE.test(email)) {
      setError("That doesn't look like an email address. Fix it, or leave it empty for now.");
      return;
    }
    setError("");
    if (email) setConfirming(true);
    else create();
  }

  function handleEditFromConfirm() {
    setConfirming(false);
    setError("");
    emailInputRef.current?.focus();
  }

  async function create() {
    setError("");
    setCreating(true);
    const email = accountantEmail.trim();
    try {
      // Safety net: if a BX folder already exists (e.g. this page was reached
      // because a flaky connection hid it), reuse it — never create a second
      // company folder and fork the user's books.
      const existingRootId = await findExistingCompanyRootFolder(accessToken);
      const rootId = existingRootId || (await getCompanyRootFolderId(accessToken, companyName.trim()));
      if (email) await shareWithEmail(accessToken, rootId, email, "reader");
      await saveProfile(accessToken, rootId, {
        companyName: companyName.trim(),
        accountantEmail: email,
        fiscalYearStart,
        // A business starting fresh begins on yearly files. A folder that already
        // exists may hold monthly ones, which move from Settings.
        ...(existingRootId ? {} : { layout: "yearly" }),
      });
      await ensureMonthFolders(accessToken, rootId, new Date());
      setDone({ yearly: !existingRootId });
    } catch {
      setError("Something went wrong setting up your folder. Check your connection and try again.");
      setConfirming(false);
    } finally {
      setCreating(false);
    }
  }

  const shell = "min-h-dvh bg-background font-sans text-text-primary flex flex-col max-w-md mx-auto px-7 pt-14 pb-8";

  if (done) {
    const now = new Date();
    const name = companyName.trim();
    const fy = String(fiscalYearNumber(now, Number(fiscalYearStart)));
    const path = done.yearly
      ? `BX - ${name} / ${fy} / ${yearFileName(name, fy)}`
      : `BX - ${name} / ${now.getFullYear()} / ${now.toLocaleString("en-US", { month: "long" })}`;
    return (
      <div className={shell}>
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
          <div className="size-16 rounded-full bg-brand-teal grid place-items-center" aria-hidden="true">
            <Check className="size-7 text-white" strokeWidth={2.4} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">You're all set</h1>
          <p className="text-sm text-text-secondary">Your receipts will be saved in your Google Drive, in:</p>
          <div className="bg-card ring-1 ring-hairline rounded-xl px-4 py-3 text-[13px] font-mono break-words max-w-full">{path}</div>
          {billing?.state === "trial" && (
            <p className="text-sm text-text-secondary">
              Your {TRIAL_DAYS}-day free trial has started. No card needed until it ends, then it's {PRICE_LABEL}.
            </p>
          )}
        </div>
        <button
          className="w-full rounded-full bg-brand-teal py-4 font-semibold text-white hover:opacity-90 transition"
          onClick={() => router.replace("/capture")}
        >
          Snap your first receipt
        </button>
        <button className="w-full py-3 mt-1 text-sm font-medium text-text-secondary" onClick={() => router.replace("/")}>
          Go to Home
        </button>
      </div>
    );
  }

  if (!accessToken) {
    return (
      <div className={shell}>
        <Steps step={1} />
        <h1 className="text-2xl font-semibold tracking-tight mb-3">Connect your Google Drive</h1>
        <p className="text-sm text-text-secondary leading-relaxed">
          BX keeps every receipt in a folder in your own Google Drive, so you always own your files.
        </p>
        {user?.email && (
          <p className="text-sm text-text-secondary leading-relaxed mt-3">
            Google will open on <strong className="text-text-primary">{user.email}</strong>, the account you just signed in with.
          </p>
        )}
        <div className="flex-1 grid place-items-center">
          <div className="size-20 rounded-3xl bg-brand-teal-soft grid place-items-center" aria-hidden="true">
            <Cloud className="size-9 text-brand-teal" strokeWidth={1.6} />
          </div>
        </div>
        {loadError ? (
          <>
            <p className="text-sm text-destructive text-center mb-3" role="alert">
              We couldn't reach Google Drive. Check your internet connection and try again.
            </p>
            <button
              type="button"
              onClick={retryConnection}
              className="w-full rounded-full ring-1 ring-hairline-strong bg-card py-4 font-semibold text-text-primary hover:bg-muted transition"
            >
              Try again
            </button>
          </>
        ) : needsConnect ? (
          <button
            type="button"
            onClick={requestAccess}
            className="w-full rounded-full bg-brand-teal py-4 font-semibold text-white hover:opacity-90 transition"
          >
            Connect Google Drive
          </button>
        ) : (
          <p className="text-sm text-text-secondary text-center py-4" role="status">
            Connecting…
          </p>
        )}
      </div>
    );
  }

  return (
    <div className={shell}>
      <Steps step={2} />
      <h1 className="text-2xl font-semibold tracking-tight mb-6">Tell us about your business</h1>

      {/* A real form, so Return submits from any field. noValidate keeps our
          own plain-language checks. */}
      <form
        className="flex flex-col flex-1"
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          if (!confirming) handleFinish();
        }}
      >
        <div className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-text-secondary">Company name</span>
            <input
              className={inputClass}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="e.g. Rivera Contracting"
              autoFocus
              disabled={confirming || creating}
            />
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-text-secondary">Accountant's email (optional)</span>
            <input
              className={inputClass}
              ref={emailInputRef}
              type="email"
              value={accountantEmail}
              onChange={(e) => setAccountantEmail(e.target.value)}
              placeholder="name@example.com"
              disabled={confirming || creating}
            />
            <span className="text-xs text-text-secondary">They'll be able to see your receipts, not change them. You can add this later in Settings.</span>
          </label>

          <label className="flex flex-col gap-1.5">
            <span className="text-sm text-text-secondary">Fiscal year starts in</span>
            <div className="relative">
              <select
                className={`${inputClass} appearance-none pr-10`}
                value={fiscalYearStart}
                onChange={(e) => setFiscalYearStart(e.target.value)}
                disabled={confirming || creating}
              >
                {MONTH_NAMES.map((m, i) => (
                  <option key={m} value={String(i + 1)}>
                    {m}
                  </option>
                ))}
              </select>
              <ChevronDown
                className="pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 size-4 text-text-secondary"
                aria-hidden="true"
              />
            </div>
            <span className="text-xs text-text-secondary">Not sure? Most businesses use January. Ask your accountant if unsure.</span>
          </label>
        </div>

        {error && (
          <p className="text-sm text-destructive mt-4" role="alert">
            {error}
          </p>
        )}

        <div className="flex-1 min-h-6" />

        {!confirming ? (
          <button
            type="submit"
            className="w-full rounded-full bg-brand-teal py-4 font-semibold text-white hover:opacity-90 transition disabled:opacity-60"
            disabled={!companyName.trim() || creating}
          >
            {creating ? "Setting up…" : "Finish setup"}
          </button>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <p className="text-sm text-center">
              Let <strong>{accountantEmail.trim()}</strong> see your receipts?
            </p>
            <button
              type="button"
              className="w-full rounded-full bg-brand-teal py-4 font-semibold text-white hover:opacity-90 transition disabled:opacity-60"
              onClick={create}
              disabled={creating}
            >
              {creating ? "Setting up…" : "Yes, share and finish"}
            </button>
            <button
              type="button"
              className="text-sm text-text-secondary underline underline-offset-4 disabled:opacity-60"
              onClick={handleEditFromConfirm}
              disabled={creating}
            >
              Change the email
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
