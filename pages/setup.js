import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
import { Check } from "lucide-react";
import { useDrive } from "../lib/useDrive";
import {
  getCompanyRootFolderId,
  findExistingCompanyRootFolder,
  shareWithEmail,
  saveProfile,
  ensureMonthFolders,
} from "../lib/google";
import DriveFallback from "../components/DriveFallback";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const inputClass =
  "w-full h-12 rounded-xl bg-white ring-1 ring-black/10 px-4 text-sm text-text-primary placeholder:text-text-secondary focus:outline-none focus:ring-brand-teal disabled:opacity-60";

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
          <div className="bg-white ring-1 ring-black/5 rounded-xl px-4 py-3 text-[13px] font-mono">
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
        <>
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
              onKeyDown={(e) => e.key === "Enter" && !confirming && handleGetStarted()}
              disabled={confirming}
            />
          </div>

          {error && <p className="text-sm text-destructive mt-4">{error}</p>}

          <div className="flex-1" />

          {!confirming ? (
            <button
              className="w-full rounded-full bg-brand-teal py-4 font-semibold text-white hover:opacity-90 transition disabled:opacity-60"
              onClick={handleGetStarted}
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
                className="w-full rounded-full bg-brand-teal py-4 font-semibold text-white hover:opacity-90 transition disabled:opacity-60"
                onClick={handleConfirmShare}
                disabled={creating}
              >
                {creating ? "Setting up…" : "Yes, share"}
              </button>
              <button
                className="text-sm text-text-secondary underline underline-offset-4 disabled:opacity-60"
                onClick={handleEditFromConfirm}
                disabled={creating}
              >
                edit
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
