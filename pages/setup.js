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

export default function Setup({ user }) {
  const router = useRouter();
  const { accessToken, profile, profileLoading, needsConnect, requestAccess } = useDrive(user);

  const [companyName, setCompanyName] = useState("");
  const [accountantEmail, setAccountantEmail] = useState("");
  const [creating, setCreating] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState("");

  // Already set up? Don't let them redo it by mistake.
  useEffect(() => {
    if (!profileLoading && profile) router.replace("/");
  }, [profileLoading, profile]);

  async function handleSubmit() {
    if (!companyName.trim() || !accountantEmail.trim() || !accessToken) return;
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
      <div className="app-header">
        <div>
          <h1>BX</h1>
          <div className="subtitle">Let's set up your workspace.</div>
        </div>
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

      {accessToken && (
        <div className="card">
          <label>Company Name <span className="required">*</span></label>
          <input
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            placeholder="Acme Inc."
            autoFocus
          />

          <label>Accountant's Gmail <span className="required">*</span></label>
          <input
            type="email"
            value={accountantEmail}
            onChange={(e) => setAccountantEmail(e.target.value)}
            placeholder="accountant@firm.com"
            onKeyDown={(e) => e.key === "Enter" && handleSubmit()}
          />

          {error && <div className="status status-error">{error}</div>}

          <div style={{ marginTop: 16 }}>
            <button
              className="btn btn-primary"
              onClick={handleSubmit}
              disabled={!companyName.trim() || !accountantEmail.trim() || creating}
            >
              {creating ? "Setting up..." : "Get Started"}
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
