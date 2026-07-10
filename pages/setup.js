import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/router";
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

  // Owner override: onboarding is a single screen — tapping "Get Started"
  // swaps just the button area in place to a compact inline confirmation
  // (the confirm-before-share safeguard, audit #10) rather than navigating
  // to a second step. The actual sharing work still only runs from
  // handleConfirmShare, after the user has explicitly said "Yes, share".
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
      <div className="onboard-screen">
        <div className="onboard-success">
          <div className="onboard-success-icon" aria-hidden="true">
            <svg width="26" height="20" viewBox="0 0 26 20">
              <path
                d="M2 10l7 7L24 2"
                stroke="var(--on-dark)"
                strokeWidth="2.4"
                fill="none"
                strokeLinecap="round"
                strokeLinejoin="round"
              />
            </svg>
          </div>
          <h1 className="onboard-success-title">You're all set</h1>
          <div className="onboard-success-copy">Receipts will be saved to:</div>
          <div className="onboard-path-chip">
            BX - {companyName} / {now.getFullYear()} / {now.toLocaleString("en-US", { month: "long" })}
          </div>
          <button className="btn btn-primary onboard-success-btn" onClick={() => router.replace("/")}>
            Go to BXT
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="onboard-screen">
      <h1 className="onboard-title">Tell us about your business.</h1>

      {!accessToken ? (
        <DriveFallback
          needsConnect={needsConnect}
          loadError={loadError}
          onConnect={requestAccess}
          onRetry={retryConnection}
        />
      ) : (
        <>
          <div className="onboard-fields">
            <input
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="Company name"
              autoFocus
              disabled={confirming}
            />
            <input
              ref={emailInputRef}
              type="email"
              value={accountantEmail}
              onChange={(e) => setAccountantEmail(e.target.value)}
              placeholder="Accountant's email"
              onKeyDown={(e) => e.key === "Enter" && !confirming && handleGetStarted()}
              disabled={confirming}
            />
          </div>

          {error && <div className="status status-error">{error}</div>}

          <div className="onboard-spacer" />

          {!confirming ? (
            <button
              className="btn btn-primary"
              onClick={handleGetStarted}
              disabled={!companyName.trim() || !accountantEmail.trim()}
            >
              Get Started
            </button>
          ) : (
            <div className="onboard-confirm">
              <div className="onboard-confirm-text">
                Give read-only access to <strong>{accountantEmail.trim()}</strong>?
              </div>
              <button className="btn btn-primary" onClick={handleConfirmShare} disabled={creating}>
                {creating ? "Setting up…" : "Yes, share"}
              </button>
              <button className="quiet-link onboard-confirm-edit" onClick={handleEditFromConfirm} disabled={creating}>
                edit
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
