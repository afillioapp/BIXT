import { useState, useEffect, useRef } from "react";
import { signOut } from "firebase/auth";
import { auth } from "../lib/firebase";
import { isLockEnabled, verifyLock } from "../lib/biometric";
import Logo from "./Logo";

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
  const autoTriedRef = useRef(false);

  const locked = !!user && isLockEnabled(user.uid) && !unlocked;

  // Pop the Face ID prompt automatically the moment the lock screen appears
  // (owner request). Some browsers refuse WebAuthn without a tap and reject
  // instantly — the auto attempt fails silently there and the Unlock button
  // remains as the fallback, with no error shown for the automatic try.
  useEffect(() => {
    if (!locked || autoTriedRef.current) return;
    autoTriedRef.current = true;
    (async () => {
      setVerifying(true);
      try {
        const ok = await verifyLock(user.uid);
        if (ok) {
          window.sessionStorage.setItem(unlockedFlag, "1");
          setUnlocked(true);
        }
      } catch {
        // Silent — the button below is the fallback.
      } finally {
        setVerifying(false);
      }
    })();
  }, [locked, user, unlockedFlag]);

  if (!locked) {
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
      <div className="lock-wordmark">
        <Logo size={24} />
      </div>
      <div className="lock-glyph" aria-hidden="true">
        <svg width="24" height="24" viewBox="0 0 24 24">
          <rect x="4" y="10" width="16" height="11" rx="2" fill="none" stroke="var(--text)" strokeWidth="1.6" />
          <path d="M7 10V7a5 5 0 0 1 10 0v3" fill="none" stroke="var(--text)" strokeWidth="1.6" />
        </svg>
      </div>
      <h1 className="lock-title">BX is locked</h1>
      {error && (
        <div className="status status-error lock-error">Couldn't verify — try again.</div>
      )}
      <button className="btn btn-primary lock-btn" onClick={handleUnlock} disabled={verifying}>
        {verifying ? "Checking…" : "Unlock with Face ID"}
      </button>
      <button className="quiet-link" onClick={handleSignOut}>
        Sign out
      </button>
    </div>
  );
}
