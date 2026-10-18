import { useState, useEffect } from "react";
import { signOut } from "firebase/auth";
import {
  Building2,
  Cloud,
  Mail,
  CalendarRange,
  Landmark,
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
import PageHeader from "../components/PageHeader";
import { biometricAvailable, isLockEnabled, enableLock, disableLock } from "../lib/biometric";
import { getTheme, setTheme } from "../lib/theme";
import { MONTH_NAMES, fiscalStartMonth } from "../lib/insights";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LAST4_RE = /^\d{4}$/;

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
        on ? "bg-brand-teal" : "bg-track"
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

  const [fyStart, setFyStart] = useState("1");
  const [fySaving, setFySaving] = useState(false);
  const [fyStatus, setFyStatus] = useState(null);

  const [bankEditing, setBankEditing] = useState(false);
  const [bankName, setBankName] = useState("");
  const [bankLast4, setBankLast4] = useState("");
  const [bankSaving, setBankSaving] = useState(false);
  const [bankStatus, setBankStatus] = useState(null);

  useEffect(() => {
    setThemeState(getTheme());
  }, []);

  function handleSetTheme(next) {
    setTheme(next);
    setThemeState(next);
  }

  useEffect(() => {
    if (!profile) return;
    setAccountantEmail(profile.accountantEmail || "");
    setFyStart(String(fiscalStartMonth(profile)));
    setBankName(profile.bankName || "");
    setBankLast4(profile.bankLast4 || "");
  }, [profile]);

  // Saves as soon as a month is picked — one choice, nothing to confirm.
  async function handleFiscalChange(next) {
    const previous = fyStart;
    setFyStart(next);
    setFySaving(true);
    setFyStatus(null);
    try {
      await saveProfile(accessToken, rootFolderId, { fiscalYearStart: next });
      setFyStatus({ type: "success", text: "Saved" });
      reloadProfile();
    } catch (err) {
      setFyStart(previous);
      setFyStatus({ type: "error", text: err.message });
    } finally {
      setFySaving(false);
    }
  }

  function cancelBankEdit() {
    setBankEditing(false);
    setBankName(profile.bankName || "");
    setBankLast4(profile.bankLast4 || "");
    setBankStatus(null);
  }

  async function handleSaveBank() {
    if (bankLast4 && !LAST4_RE.test(bankLast4)) {
      setBankStatus({ type: "error", text: "Enter exactly the last 4 digits" });
      return;
    }
    setBankSaving(true);
    setBankStatus(null);
    try {
      await saveProfile(accessToken, rootFolderId, { bankName: bankName.trim(), bankLast4 });
      setBankStatus({ type: "success", text: "Bank account saved" });
      setBankEditing(false);
      reloadProfile();
    } catch (err) {
      setBankStatus({ type: "error", text: err.message });
    } finally {
      setBankSaving(false);
    }
  }

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
      <PageHeader tall>
        <h1 className="text-2xl font-semibold tracking-tight text-center mb-8">Settings</h1>

        <div className="flex flex-col items-center gap-3">
          {user?.photoURL ? (
            <img
              src={user.photoURL}
              alt=""
              referrerPolicy="no-referrer"
              width={96}
              height={96}
              className="size-24 rounded-full object-cover ring-2 ring-hairline"
            />
          ) : (
            <div className="size-24 rounded-full bg-brand-navy text-white grid place-items-center text-2xl font-semibold ring-2 ring-hairline dark:ring-hairline-strong">
              {initialsFor(user?.displayName, profile.companyName)}
            </div>
          )}
          <div className="text-center">
            <p className="font-semibold text-lg">{user?.displayName || profile.companyName}</p>
            <p className="text-sm text-text-secondary">{user?.email || user?.phoneNumber || "—"}</p>
          </div>
        </div>
      </PageHeader>

      <div className="mx-auto max-w-md px-5 pt-6">
        <div className="bg-card ring-1 ring-hairline rounded-2xl divide-y divide-hairline overflow-hidden mb-6">
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
                    className="flex-1 h-9 rounded-full ring-1 ring-hairline-strong text-sm font-medium"
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
                  className="w-full h-11 rounded-lg ring-1 ring-hairline-strong px-3 text-sm mb-3 focus:outline-none focus:ring-brand-teal"
                  type="email"
                  value={accountantEmail}
                  onChange={(e) => setAccountantEmail(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && handleSaveAccountant()}
                  autoFocus
                />
                <div className="flex gap-2">
                  <button
                    className="flex-1 h-9 rounded-full ring-1 ring-hairline-strong text-sm font-medium"
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
                {/* One-liner (owner request): the current email only appears
                    after tapping, inside the edit view. */}
                <p className="flex-1 min-w-0 text-sm">Accountant's email</p>
                <ChevronRight className="size-4 text-text-tertiary shrink-0" />
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
              <CalendarRange className="size-4 text-text-secondary shrink-0" />
              <label htmlFor="fiscal-start" className="flex-1 min-w-0 text-sm">
                Fiscal year starts
              </label>
              <select
                id="fiscal-start"
                value={fyStart}
                onChange={(e) => handleFiscalChange(e.target.value)}
                disabled={fySaving}
                className="text-sm text-text-secondary bg-transparent text-right appearance-none focus:outline-none disabled:opacity-60 cursor-pointer"
              >
                {MONTH_NAMES.map((m, i) => (
                  <option key={m} value={String(i + 1)}>
                    {m}
                  </option>
                ))}
              </select>
              <ChevronRight className="size-4 text-text-tertiary shrink-0" />
            </div>
            {fyStatus && (
              <p className={`mt-2 text-xs ${fyStatus.type === "error" ? "text-destructive" : "text-brand-teal"}`}>
                {fyStatus.text}
              </p>
            )}
          </div>

          <div className="p-4">
            {bankEditing ? (
              <div>
                <p className="text-sm text-text-secondary mb-2">Business bank account</p>
                <div className="flex gap-2 mb-3">
                  <input
                    className="flex-1 min-w-0 h-11 rounded-lg bg-card ring-1 ring-hairline-strong px-3 text-sm focus:outline-none focus:ring-brand-teal"
                    value={bankName}
                    onChange={(e) => setBankName(e.target.value)}
                    placeholder="Bank name"
                    maxLength={40}
                    autoFocus
                  />
                  <input
                    className="w-24 h-11 rounded-lg bg-card ring-1 ring-hairline-strong px-3 text-sm focus:outline-none focus:ring-brand-teal"
                    value={bankLast4}
                    onChange={(e) => setBankLast4(e.target.value.replace(/\D/g, "").slice(0, 4))}
                    onKeyDown={(e) => e.key === "Enter" && handleSaveBank()}
                    placeholder="Last 4"
                    inputMode="numeric"
                    aria-label="Last 4 digits of the account"
                  />
                </div>
                <div className="flex gap-2">
                  <button
                    className="flex-1 h-9 rounded-full ring-1 ring-hairline-strong text-sm font-medium"
                    onClick={cancelBankEdit}
                    disabled={bankSaving}
                  >
                    Cancel
                  </button>
                  <button
                    className="flex-1 h-9 rounded-full bg-brand-teal text-white text-sm font-semibold disabled:opacity-60"
                    onClick={handleSaveBank}
                    disabled={bankSaving}
                  >
                    {bankSaving ? "Saving…" : "Save"}
                  </button>
                </div>
              </div>
            ) : (
              <button className="w-full flex items-center gap-3 text-left" onClick={() => setBankEditing(true)}>
                <Landmark className="size-4 text-text-secondary shrink-0" />
                <p className="flex-1 min-w-0 text-sm">Bank account</p>
                <span className="text-sm text-text-secondary shrink-0 truncate max-w-[50%]">
                  {profile.bankName || profile.bankLast4
                    ? [profile.bankName, profile.bankLast4 && `••${profile.bankLast4}`].filter(Boolean).join(" ")
                    : "Add"}
                </span>
                <ChevronRight className="size-4 text-text-tertiary shrink-0" />
              </button>
            )}
            {bankStatus && (
              <p className={`mt-2 text-xs ${bankStatus.type === "error" ? "text-destructive" : "text-brand-teal"}`}>
                {bankStatus.text}
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
              <p className="flex-1 min-w-0 text-sm">Appearance</p>
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
                <p className="flex-1 min-w-0 text-sm">Face ID lock</p>
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

        {/* Moved here from Home (owner request) — Settings' last card. */}
        <section className="mt-4 bg-card rounded-2xl p-5 ring-1 ring-hairline flex flex-col items-start gap-1">
          <p className="text-sm font-bold">Help us make BX better</p>
          <p className="text-xs text-text-secondary mb-2">Tell us what's confusing, broken, or missing.</p>
          <a
            href="mailto:alireza.mthr@gmail.com?subject=BX%20feedback"
            className="inline-flex items-center justify-center rounded-xl bg-background ring-1 ring-hairline text-text-primary text-xs font-semibold px-5 h-9"
          >
            Send feedback
          </a>
        </section>
      </div>
    </div>
  );
}
