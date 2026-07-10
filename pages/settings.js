import { useState, useEffect } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useDrive } from "../lib/useDrive";
import { listSharedEmails, removeSharedEmail, shareWithEmail, saveProfile } from "../lib/google";
import DriveFallback from "../components/DriveFallback";
import { biometricAvailable, isLockEnabled, enableLock, disableLock } from "../lib/biometric";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function Settings({ user }) {
  const { accessToken, rootFolderId, profile, profileLoading, needsConnect, loadError, driveEmail, requestAccess, retryConnection, reloadProfile, disconnect } = useDrive(user);
  const [accountantEmail, setAccountantEmail] = useState("");
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);

  const [bioSupported, setBioSupported] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bioSaving, setBioSaving] = useState(false);
  const [bioStatus, setBioStatus] = useState(null);

  useEffect(() => {
    if (profile) setAccountantEmail(profile.accountantEmail || "");
  }, [profile]);

  // Only show the lock toggle on devices that actually have a platform
  // authenticator (Face ID / fingerprint / Windows Hello) available.
  useEffect(() => {
    let cancelled = false;
    biometricAvailable().then((supported) => {
      if (!cancelled) setBioSupported(supported);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (user?.uid) setBioEnabled(isLockEnabled(user.uid));
  }, [user]);

  async function handleToggleLock() {
    if (!user?.uid || bioSaving) return;
    setBioStatus(null);
    if (bioEnabled) {
      disableLock(user.uid);
      setBioEnabled(false);
      setBioStatus({ type: "success", text: "Lock turned off" });
      return;
    }
    setBioSaving(true);
    try {
      await enableLock(user);
      setBioEnabled(true);
      setBioStatus({ type: "success", text: "Lock turned on" });
    } catch {
      setBioStatus({ type: "error", text: "Couldn't turn on Face ID / fingerprint on this device." });
    } finally {
      setBioSaving(false);
    }
  }

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

  const driveMismatch =
    driveEmail && user?.email && driveEmail.toLowerCase() !== user.email.toLowerCase();

  return (
    <div className="container">
      <div className="app-header">
        <div><h1>Settings</h1></div>
      </div>

      <div className="settings-card">
        <div className="settings-row">
          <div className="settings-row-label">Company</div>
          <div className="settings-row-value">{profile.companyName}</div>
        </div>

        <div className="settings-row">
          <div className="settings-row-label">Signed in as</div>
          <div className="settings-row-value">{user?.email || user?.phoneNumber || "—"}</div>
        </div>

        <div className="settings-row">
          <div className="settings-row-label">Receipts saved to Google Drive of</div>
          <div className="settings-row-value">{driveEmail || "—"}</div>
          {driveMismatch && (
            <div className="settings-mismatch">
              ⚠ This doesn't match your sign-in email. Receipts may not sync as expected.
            </div>
          )}
        </div>

        {editing && confirming ? (
          <div className="settings-row">
            <div className="settings-confirm-text">
              Give read-only access to {accountantEmail.trim()} instead?
            </div>
            <div className="settings-row-actions">
              <button
                className="btn btn-secondary settings-btn-small"
                onClick={() => setConfirming(false)}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary settings-btn-small"
                onClick={handleConfirmShare}
                disabled={saving}
              >
                {saving ? "Saving…" : "Yes, update"}
              </button>
            </div>
          </div>
        ) : editing ? (
          <div className="settings-row">
            <div className="settings-row-label" style={{ marginBottom: 8 }}>Accountant's email</div>
            <input
              className="settings-edit-input"
              type="email"
              value={accountantEmail}
              onChange={(e) => setAccountantEmail(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSaveAccountant()}
              autoFocus
            />
            <div className="settings-row-actions">
              <button
                className="btn btn-secondary settings-btn-small"
                onClick={() => { setEditing(false); setConfirming(false); setAccountantEmail(profile.accountantEmail || ""); }}
                disabled={saving}
              >
                Cancel
              </button>
              <button
                className="btn btn-primary settings-btn-small"
                onClick={handleSaveAccountant}
                disabled={saving || !accountantEmail.trim()}
              >
                Save
              </button>
            </div>
          </div>
        ) : (
          <button className="settings-row settings-row-tappable" onClick={() => setEditing(true)}>
            <div className="settings-row-split">
              <div>
                <div className="settings-row-label">Accountant's email</div>
                <div className="settings-row-value">{profile.accountantEmail}</div>
              </div>
              <span className="settings-edit-hint">Edit</span>
            </div>
          </button>
        )}

        {status && (
          <div className="settings-row">
            <div className={`status status-${status.type}`} style={{ marginBottom: 0 }}>{status.text}</div>
          </div>
        )}
      </div>

      {bioSupported && (
        <div className="settings-card settings-card-padded">
          <div className="settings-section-label">Security</div>
          <div className="settings-toggle-row">
            <div>
              <div className="settings-toggle-title">Require Face ID to open BXT</div>
              <div className="settings-toggle-status">
                {bioSaving ? "Working…" : bioEnabled ? "On" : "Off"}
              </div>
            </div>
            <button
              className={`pill-toggle ${bioEnabled ? "on" : ""}`}
              onClick={handleToggleLock}
              disabled={bioSaving}
              role="switch"
              aria-checked={bioEnabled}
              aria-label="Require Face ID to open BXT"
            >
              <span className="pill-toggle-knob" />
            </button>
          </div>
          {bioStatus && (
            <div className={`status status-${bioStatus.type}`} style={{ margin: "10px 0 0" }}>{bioStatus.text}</div>
          )}
        </div>
      )}

      <div className="settings-card">
        <button
          className="settings-signout"
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
