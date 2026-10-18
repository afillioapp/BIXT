import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { Check, ChevronDown } from "lucide-react";
import { useDrive } from "../lib/useDrive";
import {
  getCompanyRootFolderId,
  findExistingCompanyRootFolder,
  shareWithEmail,
  saveProfile,
  ensureMonthFolders,
} from "../lib/google";
import DriveFallback from "../components/DriveFallback";
import { MONTH_NAMES } from "../lib/insights";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LAST4_RE = /^\d{4}$/;

const inputClass =
  "w-full h-12 rounded-xl bg-card ring-1 ring-hairline-strong px-4 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-brand-teal disabled:opacity-60";

// Rebuilt in the ported Lovable design language (light page, design-system
// inputs, teal pills). Behavior unchanged: single-screen onboarding whose
// "Get Started" swaps the button area in place for the inline
// confirm-before-share step (audit #10); the actual sharing work still only
// runs from handleConfirmShare after an explicit "Yes, share".
export default function Setup({ user }) {
  const router = useRouter();
  const { accessToken, profile, profileLoading, needsConnect, loadError, requestAccess, retryConnection } = useDrive(user);

  const [companyName, setCompanyName] = useState("");
  const [accountantEmail, setAccountantEmail] = useState("");
  const [fiscalYearStart, setFiscalYearStart] = useState("1");
  const [bankName, setBankName] = useState("");
  const [bankLast4, setBankLast4] = useState("");
  const [creating, setCreating] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);
  const emailInputRef = useRef(null);

  // Already set up? Don't let them redo it by mistake.
  useEffect(() => {
    if (!profileLoading && profile) router.replace("/");
  }, [profileLoading, profile]);

  function handleGetStarted() {
    if (!companyName.trim() || !accountantEmail.trim() || !accessToken) return;
    if (!EMAIL_RE.test(accountantEmail.trim())) {
      setError("That doesn't look like an email address");
      return;
    }
    if (bankLast4 && !LAST4_RE.test(bankLast4)) {
      setError("Enter exactly the last 4 digits of the account");
      return;
    }
    setError("");
    setConfirming(true);
  }

  function handleEditFromConfirm() {
    setConfirming(false);
    setError("");
    emailInputRef.current?.focus();
  }

  async function handleConfirmShare() {
    setError("");
    setCreating(true);
    try {
      // Safety net: if a BX folder already exists (e.g. this page was reached
      // because a flaky connection hid it), reuse it — never create a second
      // company folder and fork the user's books.
      const existingRootId = await findExistingCompanyRootFolder(accessToken);
      const rootId = existingRootId || (await getCompanyRootFolderId(accessToken, companyName.trim()));
      await shareWithEmail(accessToken, rootId, accountantEmail.trim(), "reader");
      await saveProfile(accessToken, rootId, {
        companyName: companyName.trim(),
        accountantEmail: accountantEmail.trim(),
        fiscalYearStart,
        bankName: bankName.trim(),
        bankLast4,
      });
      await ensureMonthFolders(accessToken, rootId, new Date());
      setDone(true);
    } catch (err) {
      setError(err.message);
      setConfirming(false);
    } finally {
      setCreating(false);
    }
  }

  if (done) {
    const now = new Date();
    return (
      <div className="min-h-dvh bg-background font-sans text-text-primary flex flex-col max-w-md mx-auto px-7 pt-16 pb-8">
        <div className="flex-1 flex flex-col items-center justify-center text-center gap-4">
          <div className="size-16 rounded-full bg-brand-teal grid place-items-center" aria-hidden="true">
            <Check className="size-7 text-white" strokeWidth={2.4} />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight">You're all set</h1>
          <p className="text-sm text-text-secondary">Receipts will be saved to:</p>
          <div className="bg-card ring-1 ring-hairline rounded-xl px-4 py-3 text-[13px] font-mono">
            BX - {companyName} / {now.getFullYear()} / {now.toLocaleString("en-US", { month: "long" })}
          </div>
          <button
            className="w-full rounded-full bg-brand-teal py-4 font-semibold text-white hover:opacity-90 transition mt-3"
            onClick={() => router.replace("/")}
          >
            Go to BX
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-dvh bg-background font-sans text-text-primary flex flex-col max-w-md mx-auto px-7 pt-16 pb-8">
      <h1 className="text-2xl font-semibold tracking-tight mb-7">Tell us about your business.</h1>

      {!accessToken ? (
        <DriveFallback
          needsConnect={needsConnect}
          loadError={loadError}
          onConnect={requestAccess}
          onRetry={retryConnection}
        />
      ) : (
        // A real form, so Return submits from any field (the iPhone number
        // pad on "Last 4" has no Return key, so a per-field handler there
        // could never fire). noValidate keeps our own plain-language checks.
        <form
          className="flex flex-col flex-1"
          noValidate
          onSubmit={(e) => {
            e.preventDefault();
            if (!confirming) handleGetStarted();
          }}
        >
          <div className="flex flex-col gap-3">
            <input
              className={inputClass}
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Company name"
              autoFocus
              disabled={confirming}
            />
            <input
              className={inputClass}
              ref={emailInputRef}
              type="email"
              value={accountantEmail}
              onChange={(e) => setAccountantEmail(e.target.value)}
              placeholder="Accountant's email"
              disabled={confirming}
            />

            <label className="flex flex-col gap-1.5 mt-2">
              <span className="text-sm text-text-secondary">Fiscal year starts in</span>
              <div className="relative">
                <select
                  className={`${inputClass} appearance-none pr-10`}
                  value={fiscalYearStart}
                  onChange={(e) => setFiscalYearStart(e.target.value)}
                  disabled={confirming}
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
              <span className="text-xs text-text-secondary">Not sure? Most businesses use January.</span>
            </label>

            {/* For the owner's own reference only — never the full number. */}
            <div className="flex flex-col gap-1.5 mt-2">
              <span className="text-sm text-text-secondary">Business bank account (optional)</span>
              <div className="flex gap-2.5">
                <input
                  className={inputClass}
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Bank name"
                  maxLength={40}
                  disabled={confirming}
                />
                <input
                  className={`${inputClass} max-w-[120px]`}
                  value={bankLast4}
                  onChange={(e) => setBankLast4(e.target.value.replace(/\D/g, "").slice(-4))}
                  placeholder="Last 4"
                  inputMode="numeric"
                  aria-label="Last 4 digits of the account"
                  disabled={confirming}
                />
              </div>
            </div>
          </div>

          {error && <p className="text-sm text-destructive mt-4">{error}</p>}

          <div className="flex-1" />

          {!confirming ? (
            <button
              type="submit"
              className="w-full rounded-full bg-brand-teal py-4 font-semibold text-white hover:opacity-90 transition disabled:opacity-60"
              disabled={!companyName.trim() || !accountantEmail.trim()}
            >
              Get Started
            </button>
          ) : (
            <div className="flex flex-col items-center gap-3">
              <p className="text-sm text-center">
                Give read-only access to <strong>{accountantEmail.trim()}</strong>?
              </p>
              <button
                type="button"
                className="w-full rounded-full bg-brand-teal py-4 font-semibold text-white hover:opacity-90 transition disabled:opacity-60"
                onClick={handleConfirmShare}
                disabled={creating}
              >
                {creating ? "Setting up…" : "Yes, share"}
              </button>
              <button
                type="button"
                className="text-sm text-text-secondary underline underline-offset-4 disabled:opacity-60"
                onClick={handleEditFromConfirm}
                disabled={creating}
              >
                edit
              </button>
            </div>
          )}
        </form>
      )}
    </div>
  );
}
