import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useDrive } from "../lib/useDrive";
import {
  getCompanyRootFolderId,
  findExistingCompanyRootFolder,
  shareWithEmail,
  saveProfile,
  ensureMonthFolders,
} from "../lib/google";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Setup({ user }) {
  const router = useRouter();
  const { accessToken, profile, profileLoading, needsConnect, requestAccess } = useDrive(user);

  const [companyName, setCompanyName] = useState("");
  const [accountantEmail, setAccountantEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");
  const [confirming, setConfirming] = useState(false);

  // Already set up? Don't let them redo it by mistake.
  useEffect(() => {
    if (!profileLoading && profile) router.replace("/");
  }, [profileLoading, profile]);

  // First tap just validates and shows a plain-language confirmation before
  // any sharing happens; the actual work runs from handleConfirmShare.
  function handleGetStarted() {
    if (!companyName.trim() || !accountantEmail.trim() || !accessToken) return;
    if (!EMAIL_RE.test(accountantEmail.trim())) {
      setError("That doesn't look like an email address");
      return;
    }
    setError("");
    setConfirming(true);
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
      setTimeout(() => router.replace("/"), 1400);
    } catch (err) {
      setError(err.message);
    } finally {
      setCreating(false);
    }
  }

  if (done) {
    return (
      <div className="container">
        <div className="onboarding-overlay" style={{ position: "static", minHeight: "100vh" }}>
          <div className="onboarding-modal">
            <div className="success-check">✓</div>
            <p style={{ fontSize: 18, fontWeight: 600, color: "var(--text)" }}>You're all set</p>
            <p className="onboarding-path">
              BX - {companyName} / {new Date().getFullYear()} / {new Date().toLocaleString("en-US", { month: "long" })}
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="container">
      <div className="onboarding-header">
        <div className="onboarding-step">{confirming ? "Step 2 of 2" : "Step 1 of 2"}</div>
        <h1 className="onboarding-title">
          {confirming ? "Confirm accountant access" : "Set up your workspace"}
        </h1>
      </div>

      {!accessToken && (
        <div className="card">
          <div style={{ marginBottom: 10, fontSize: 14 }}>
            Connect your Google Drive to get started
          </div>
          <button className="btn btn-primary" onClick={requestAccess} disabled={profileLoading && !needsConnect}>
            {needsConnect || !profileLoading ? "Connect Google Drive" : "Loading..."}
          </button>
        </div>
      )}

      {accessToken && !confirming && (
        <div className="card">
          <label>Company Name <span className="required">*</span></label>
          <input
            className="onboarding-input"
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Acme Inc."
            autoFocus
          />

          <label>Accountant's Gmail <span className="required">*</span></label>
          <input
            className="onboarding-input"
            type="email"
            value={accountantEmail}
            onChange={(e) => setAccountantEmail(e.target.value)}
            placeholder="accountant@firm.com"
            onKeyDown={(e) => e.key === "Enter" && handleGetStarted()}
          />

          {error && <div className="status status-error">{error}</div>}

          <div style={{ marginTop: 16 }}>
            <button
              className="btn btn-primary"
              onClick={handleGetStarted}
              disabled={!companyName.trim() || !accountantEmail.trim()}
            >
              Get Started
            </button>
          </div>
        </div>
      )}

      {accessToken && confirming && (
        <div className="card">
          <p>We'll give read-only access to {accountantEmail.trim()}. Correct?</p>

          {error && <div className="status status-error">{error}</div>}

          <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
            <button className="btn btn-primary" onClick={handleConfirmShare} disabled={creating}>
              {creating ? "Setting up..." : "Yes, share"}
            </button>
            <button
              className="btn btn-secondary"
              onClick={() => setConfirming(false)}
              disabled={creating}
            >
              Edit
            </button>
          </div>
        </div>
      )}

      {creating && (
        <div className="onboarding-overlay">
          <div className="onboarding-modal">
            <div className="spinner" />
            <p>Creating your folder on Google Drive…</p>
            <p className="onboarding-path">
              BX - {companyName || "…"} / {new Date().getFullYear()} / {new Date().toLocaleString("en-US", { month: "long" })}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}
