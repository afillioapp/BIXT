import { useState } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { isLockEnabled, verifyLock } from "../lib/biometric";

// Gates the whole app behind a local Face ID / fingerprint prompt when the
// signed-in user has turned the lock on in Settings. This only runs client
// side (sessionStorage/localStorage), so it renders children untouched
// during SSR/first paint for any route with no user (e.g. /login).
export default function BiometricGate({ user, children }) {
  const unlockedFlag = user ? `bx_unlocked_${user.uid}` : null;
  const alreadyUnlocked =
    typeof window !== "undefined" && unlockedFlag
      ? window.sessionStorage.getItem(unlockedFlag) === "1"
      : false;

  const [unlocked, setUnlocked] = useState(alreadyUnlocked);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState(false);

  if (!user || !isLockEnabled(user.uid) || unlocked) {
    return children;
  }

  async function handleUnlock() {
    setVerifying(true);
    setError(false);
    try {
      const ok = await verifyLock(user.uid);
      if (ok) {
        window.sessionStorage.setItem(unlockedFlag, "1");
        setUnlocked(true);
      } else {
        setError(true);
      }
    } catch {
      setError(true);
    } finally {
      setVerifying(false);
    }
  }

  async function handleSignOut() {
    if (unlockedFlag) window.sessionStorage.removeItem(unlockedFlag);
    await signOut(auth);
  }

  return (
    <div className="lock-screen">
      <img src="/bx-logo.svg" alt="BX" className="lock-logo" />
      <h1 className="lock-title">BX is locked</h1>
      {error && (
        <div className="status status-error lock-error">Couldn't verify — try again.</div>
      )}
      <button className="btn btn-primary lock-btn" onClick={handleUnlock} disabled={verifying}>
        {verifying ? "Checking…" : "Unlock with Face ID / fingerprint"}
      </button>
      <button className="btn btn-secondary lock-btn-secondary" onClick={handleSignOut}>
        Sign out
      </button>
    </div>
  );
}
