import { useState, useEffect } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useDrive } from "../lib/useDrive";
import { listSharedEmails, removeSharedEmail, shareWithEmail, saveProfile } from "../lib/google";
import DriveFallback from "../components/DriveFallback";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Settings({ user }) {
  const { accessToken, rootFolderId, profile, profileLoading, needsConnect, loadError, driveEmail, requestAccess, retryConnection, reloadProfile, disconnect } = useDrive(user);
  const [accountantEmail, setAccountantEmail] = useState("");
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (profile) setAccountantEmail(profile.accountantEmail || "");
  }, [profile]);

  // First tap just validates and shows a plain-language confirmation before
  // any sharing changes happen; the actual work runs from handleConfirmShare.
  function handleSaveAccountant() {
    if (!accountantEmail.trim() || !rootFolderId) return;
    if (!EMAIL_RE.test(accountantEmail.trim())) {
      setStatus({ type: "error", text: "That doesn't look like an email address" });
      return;
    }
    setStatus(null);
    setConfirming(true);
  }

  async function handleConfirmShare() {
    const newEmail = accountantEmail.trim();
    setSaving(true);
    setStatus(null);
    try {
      // BX manages all read access on this folder, so any reader other than
      // the new accountant is stale and must go. Compare case-insensitively —
      // Google normalizes email casing, and an exact-string match used to let
      // the old accountant silently keep access forever.
      const current = await listSharedEmails(accessToken, rootFolderId);
      const staleReaders = current.filter(
        (p) => p.role === "reader" && (p.emailAddress || "").toLowerCase() !== newEmail.toLowerCase()
      );
      for (const perm of staleReaders) {
        try {
          await removeSharedEmail(accessToken, rootFolderId, perm.id);
        } catch {
          throw new Error(
            `We couldn't remove ${perm.emailAddress}'s access — they may still be able to view your files. Please try again.`
          );
        }
      }
      const alreadyShared = current.some(
        (p) => (p.emailAddress || "").toLowerCase() === newEmail.toLowerCase()
      );
      if (!alreadyShared) {
        await shareWithEmail(accessToken, rootFolderId, newEmail, "reader");
      }
      await saveProfile(accessToken, rootFolderId, {
        companyName: profile.companyName,
        accountantEmail: newEmail,
      });
      setStatus({ type: "success", text: "Accountant updated" });
      setEditing(false);
      setConfirming(false);
      reloadProfile();
    } catch (err) {
      setStatus({ type: "error", text: err.message });
    } finally {
      setSaving(false);
    }
  }

  if (profileLoading || !profile) {
    return (
      <div className="container">
        <div className="app-header"><div><h1>Settings</h1></div></div>
        <DriveFallback
          needsConnect={needsConnect}
          loadError={loadError}
          onConnect={requestAccess}
          onRetry={retryConnection}
        />
      </div>
    );
  }

  return (
    <div className="container">
      <div className="app-header">
        <div><h1>Settings</h1></div>
      </div>

      <div className="card">
        <label>Company</label>
        <div className="settings-value">{profile.companyName}</div>

        <label>Signed in as</label>
        <div className="settings-value">{user?.email || user?.phoneNumber || "—"}</div>

        <label>Receipts saved to Google Drive of</label>
        <div className="settings-value">{driveEmail || "—"}</div>
        {driveEmail && user?.email && driveEmail.toLowerCase() !== user.email.toLowerCase() && (
          <div className="status status-info" style={{ marginTop: 6 }}>
            Note: your receipts are stored in {driveEmail}'s Google Drive, which is a different
            account than the one you signed in with.
          </div>
        )}

        <label>Accountant's Gmail</label>
        {editing && confirming ? (
          <>
            <p>We'll give read-only access to {accountantEmail.trim()}. Correct?</p>
            <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
              <button
                className="btn btn-primary"
                onClick={handleConfirmShare}
                disabled={saving}
              >
                {saving ? "Saving…" : "Yes, share"}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => setConfirming(false)}
                disabled={saving}
              >
                Edit
              </button>
            </div>
          </>
        ) : editing ? (
          <>
            <input
              type="email"
              value={accountantEmail}
              onChange={(e) => setAccountantEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSaveAccountant()}
              autoFocus
            />
            <div style={{ marginTop: 10, display: "flex", gap: 8 }}>
              <button
                className="btn btn-primary"
                onClick={handleSaveAccountant}
                disabled={saving || !accountantEmail.trim()}
              >
                Save
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => { setEditing(false); setConfirming(false); setAccountantEmail(profile.accountantEmail || ""); }}
                disabled={saving}
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <div className="settings-value settings-value-editable" onClick={() => setEditing(true)}>
            {profile.accountantEmail} <span className="settings-edit-hint">Change</span>
          </div>
        )}

        {status && <div className={`status status-${status.type}`}>{status.text}</div>}
      </div>

      <div className="card">
        <button
          className="btn btn-secondary"
          onClick={async () => {
            // Let go of the Drive grant first, so the next person signing in
            // on this device can't silently inherit this user's Drive.
            await disconnect();
            await signOut(auth);
          }}
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
