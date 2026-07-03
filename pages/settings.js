import { useState, useEffect } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { useDrive } from "../lib/useDrive";
import { listSharedEmails, removeSharedEmail, shareWithEmail, saveProfile } from "../lib/google";

export default function Settings({ user }) {
  const { accessToken, rootFolderId, profile, profileLoading, reloadProfile } = useDrive(user);
  const [accountantEmail, setAccountantEmail] = useState("");
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);

  useEffect(() => {
    if (profile) setAccountantEmail(profile.accountantEmail || "");
  }, [profile]);

  async function handleSaveAccountant() {
    if (!accountantEmail.trim() || !rootFolderId) return;
    setSaving(true);
    setStatus(null);
    try {
      const current = await listSharedEmails(accessToken, rootFolderId);
      const oldPerm = current.find((p) => p.emailAddress === profile.accountantEmail);
      if (oldPerm && profile.accountantEmail !== accountantEmail.trim()) {
        await removeSharedEmail(accessToken, rootFolderId, oldPerm.id);
      }
      const alreadyShared = current.some((p) => p.emailAddress === accountantEmail.trim());
      if (!alreadyShared) {
        await shareWithEmail(accessToken, rootFolderId, accountantEmail.trim(), "reader");
      }
      await saveProfile(accessToken, rootFolderId, {
        companyName: profile.companyName,
        accountantEmail: accountantEmail.trim(),
      });
      setStatus({ type: "success", text: "Accountant updated" });
      setEditing(false);
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
        <div className="card"><div style={{ fontSize: 14 }}>Loading…</div></div>
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

        <label>Connected Google Account</label>
        <div className="settings-value">{user?.email}</div>

        <label>Accountant's Gmail</label>
        {editing ? (
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
                {saving ? "Saving…" : "Save"}
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => { setEditing(false); setAccountantEmail(profile.accountantEmail || ""); }}
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
        <button className="btn btn-secondary" onClick={() => signOut(auth)}>
          Sign Out
        </button>
      </div>
    </div>
  );
}
