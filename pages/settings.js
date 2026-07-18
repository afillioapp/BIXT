import { useState, useEffect } from "react";
import { signOut } from "firebase/auth";
import {
  Building2,
  Cloud,
  Mail,
  Sun,
  Moon,
  ScanFace,
  LogOut,
  ChevronRight,
} from "lucide-react";
import { auth } from "../lib/firebase";
import { useDrive } from "../lib/useDrive";
import { listSharedEmails, removeSharedEmail, shareWithEmail, saveProfile } from "../lib/google";
import DriveFallback from "../components/DriveFallback";
import { biometricAvailable, isLockEnabled, enableLock, disableLock } from "../lib/biometric";
import { getTheme, setTheme } from "../lib/theme";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// "Jane Doe" -> "JD"; a single name -> first two letters; nothing -> "?".
function initialsFor(name, fallback) {
  const source = (name || fallback || "").trim();
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

function Toggle({ on, onClick, disabled, label }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={label}
      disabled={disabled}
      onClick={onClick}
      className={`w-12 h-7 rounded-full relative shrink-0 transition-colors disabled:opacity-60 ${
        on ? "bg-brand-teal" : "bg-zinc-200"
      }`}
    >
      <span
        className={`absolute top-0.5 left-0.5 size-6 rounded-full bg-white shadow transition-transform ${
          on ? "translate-x-5" : ""
        }`}
      />
    </button>
  );
}

// Ported 1:1 from lovable-design/src/routes/profile.tsx: identity card
// (avatar + name + email/phone) followed by one white divided-row card.
// The source's static rows (Notifications/Security/Help & Support/Sign
// out) are replaced with BX's real settings surface: Company and "Receipts
// saved to Drive of" (read-only), Accountant's email (expands inline to the
// existing edit-then-confirm-before-share flow), Appearance and Face ID
// lock (existing theme.js / biometric.js toggle logic), and Sign out
// (disconnect() then signOut, unchanged).
export default function Settings({ user }) {
  const {
    accessToken,
    rootFolderId,
    profile,
    profileLoading,
    needsConnect,
    loadError,
    driveEmail,
    requestAccess,
    retryConnection,
    reloadProfile,
    disconnect,
  } = useDrive(user);
  const [accountantEmail, setAccountantEmail] = useState("");
  const [editing, setEditing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [saving, setSaving] = useState(false);
  const [status, setStatus] = useState(null);

  const [bioSupported, setBioSupported] = useState(false);
  const [bioEnabled, setBioEnabled] = useState(false);
  const [bioSaving, setBioSaving] = useState(false);
  const [bioStatus, setBioStatus] = useState(null);

  const [theme, setThemeState] = useState("light");

  useEffect(() => {
    setThemeState(getTheme());
  }, []);

  function handleSetTheme(next) {
    setTheme(next);
    setThemeState(next);
  }

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
      <div className="min-h-screen bg-background font-sans text-text-primary pb-28">
        <div className="mx-auto max-w-md px-5 pt-10">
          <h1 className="text-2xl font-semibold tracking-tight mb-6">Settings</h1>
          <DriveFallback
            needsConnect={needsConnect}
            loadError={loadError}
            onConnect={requestAccess}
            onRetry={retryConnection}
          />
        </div>
      </div>
    );
  }

  const driveMismatch =
    driveEmail && user?.email && driveEmail.toLowerCase() !== user.email.toLowerCase();

  return (
    <div className="min-h-screen bg-background font-sans text-text-primary pb-28">
      {/* Navy identity header (owner request, reference screenshot): title,
          then a large centered avatar/name/email on brand navy, tall enough
          that the white chevron-row cards below start noticeably lower. */}
      <div className="bg-brand-navy rounded-b-3xl pt-10 pb-12 text-white">
        <div className="mx-auto max-w-md px-5">
          <h1 className="text-2xl font-semibold tracking-tight text-center mb-8">Settings</h1>

          <div className="flex flex-col items-center gap-3">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt=""
                referrerPolicy="no-referrer"
                width={96}
                height={96}
                className="size-24 rounded-full object-cover ring-2 ring-white/20"
              />
            ) : (
              <div className="size-24 rounded-full bg-white/15 text-white grid place-items-center text-2xl font-semibold ring-2 ring-white/20">
                {initialsFor(user?.displayName, profile.companyName)}
              </div>
            )}
            <div className="text-center">
              <p className="font-semibold text-lg">{user?.displayName || profile.companyName}</p>
              <p className="text-sm text-white/60">{user?.email || user?.phoneNumber || "—"}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto max-w-md px-5 pt-6">
        <div className="bg-white ring-1 ring-black/5 rounded-2xl divide-y divide-black/5 overflow-hidden mb-6">
          <div className="flex items-center gap-3 p-4">
            <Building2 className="size-4 text-text-secondary shrink-0" />
            <div className="flex-1 min-w-0">
              <p className="text-sm">Company</p>
            </div>
            <span className="text-sm text-text-secondary shrink-0">{profile.companyName}</span>
          </div>

          <div className="p-4">
            <div className="flex items-center gap-3">
              <Cloud className="size-4 text-text-secondary shrink-0" />
              <span className="text-sm flex-1">Drive</span>
              <span className="text-sm text-text-secondary shrink-0">{driveEmail || "—"}</span>
            </div>
            {driveMismatch && (
              <p className="mt-2 text-xs text-destructive">
                This doesn't match your sign-in email. Receipts may not sync as expected.
              </p>
            )}
          </div>

          <div className="p-4">
            {editing && confirming ? (
              <div>
                <p className="text-sm mb-3">Give read-only access to {accountantEmail.trim()} instead?</p>
                <div className="flex gap-2">
                  <button
                    className="flex-1 h-9 rounded-full ring-1 ring-black/10 text-sm font-medium"
                    onClick={() => setConfirming(false)}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    className="flex-1 h-9 rounded-full bg-brand-teal text-white text-sm font-semibold disabled:opacity-60"
                    onClick={handleConfirmShare}
                    disabled={saving}
                  >
                    {saving ? "Saving…" : "Yes, update"}
                  </button>
                </div>
              </div>
            ) : editing ? (
              <div>
                <p className="text-sm text-text-secondary mb-2">Accountant's email</p>
                <input
                  className="w-full h-11 rounded-lg ring-1 ring-black/10 px-3 text-sm mb-3 focus:outline-none focus:ring-brand-teal"
                  type="email"
                  value={accountantEmail}
                  onChange={(e) => setAccountantEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveAccountant()}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    className="flex-1 h-9 rounded-full ring-1 ring-black/10 text-sm font-medium"
                    onClick={() => {
                      setEditing(false);
                      setConfirming(false);
                      setAccountantEmail(profile.accountantEmail || "");
                    }}
                    disabled={saving}
                  >
                    Cancel
                  </button>
                  <button
                    className="flex-1 h-9 rounded-full bg-brand-teal text-white text-sm font-semibold disabled:opacity-60"
                    onClick={handleSaveAccountant}
                    disabled={saving || !accountantEmail.trim()}
                  >
                    Save
                  </button>
                </div>
              </div>
            ) : (
              <button className="w-full flex items-center gap-3 text-left" onClick={() => setEditing(true)}>
                <Mail className="size-4 text-text-secondary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm">Accountant's email</p>
                  <p className="text-xs text-text-secondary truncate">{profile.accountantEmail}</p>
                </div>
                <ChevronRight className="size-4 text-zinc-400 shrink-0" />
              </button>
            )}
            {status && (
              <p className={`mt-2 text-xs ${status.type === "error" ? "text-destructive" : "text-brand-teal"}`}>
                {status.text}
              </p>
            )}
          </div>

          <div className="p-4">
            <div className="flex items-center gap-3">
              {theme === "dark" ? (
                <Moon className="size-4 text-text-secondary shrink-0" />
              ) : (
                <Sun className="size-4 text-text-secondary shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm">Appearance</p>
                <p className="text-xs text-text-secondary">{theme === "dark" ? "Dark" : "Light"}</p>
              </div>
              <Toggle
                on={theme === "dark"}
                onClick={() => handleSetTheme(theme === "dark" ? "light" : "dark")}
                label="Dark mode"
              />
            </div>
          </div>

          {bioSupported && (
            <div className="p-4">
              <div className="flex items-center gap-3">
                <ScanFace className="size-4 text-text-secondary shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm">Face ID lock</p>
                  <p className="text-xs text-text-secondary">{bioSaving ? "Working…" : bioEnabled ? "On" : "Off"}</p>
                </div>
                <Toggle on={bioEnabled} onClick={handleToggleLock} disabled={bioSaving} label="Require Face ID to open BX" />
              </div>
              {bioStatus && (
                <p className={`mt-2 text-xs ${bioStatus.type === "error" ? "text-destructive" : "text-brand-teal"}`}>
                  {bioStatus.text}
                </p>
              )}
            </div>
          )}

          <button
            className="w-full flex items-center gap-3 p-4 text-left"
            onClick={async () => {
              // Let go of the Drive grant first, so the next person signing in
              // on this device can't silently inherit this user's Drive.
              await disconnect();
              await signOut(auth);
            }}
          >
            <LogOut className="size-4 text-destructive shrink-0" />
            <span className="text-sm flex-1 text-destructive font-medium">Sign out</span>
          </button>
        </div>
      </div>
    </div>
  );
}
