import { useState, useEffect, useRef } from "react";
import { signOut } from "firebase/auth";
import { ScanFace } from "lucide-react";
import { auth } from "../lib/firebase";
import { isLockEnabled, verifyLock } from "../lib/biometric";
import Logo from "./Logo";

// Gates the whole app behind a local Face ID / fingerprint prompt when the
// signed-in user has turned the lock on in Settings. This only runs client
// side (sessionStorage/localStorage), so it renders children untouched
// during SSR/first paint for any route with no user (e.g. /login).
//
// Markup/classes ported 1:1 from lovable-design/src/routes/login.tsx (their
// Face-ID sign-in screen becomes our local re-lock screen): BX wordmark +
// "Welcome back", the big teal Face-ID tile (tap = handleUnlock; the
// existing auto-attempt effect is unchanged), an error slot, and — in place
// of their "Use passcode instead" — our own escape hatch, "Sign out".
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
  // instantly — the auto attempt fails silently there and the Unlock tile
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
        // Silent — the tile below is the fallback.
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
    <div className="fixed inset-0 z-[100] bg-brand-navy text-white flex flex-col px-8 pt-20 pb-10">
      <div className="flex flex-col items-center gap-4">
        <Logo size={40} onDark />
        <p className="text-sm text-white/60">Welcome back</p>
      </div>

      <div className="flex-1 flex flex-col items-center justify-center gap-8">
        <button
          type="button"
          onClick={handleUnlock}
          disabled={verifying}
          aria-label="Unlock with Face ID"
          className="relative h-44 w-44 rounded-[40px] bg-gradient-to-br from-brand-teal/40 via-brand-teal/10 to-transparent ring-1 ring-brand-teal/40 flex items-center justify-center transition active:scale-95 disabled:opacity-80"
        >
          <span
            className={`absolute inset-2 rounded-[32px] ring-1 ring-brand-teal/30 ${verifying ? "animate-pulse" : ""}`}
          />
          <ScanFace className="h-20 w-20 text-brand-teal" strokeWidth={1.4} />
        </button>
        <div className="text-center">
          <p className="text-lg font-semibold">{verifying ? "Checking…" : "Tap to unlock BX"}</p>
          {error ? (
            <p className="mt-2 text-sm text-red-300">Couldn't verify — try again.</p>
          ) : (
            <p className="mt-2 text-sm text-white/50">Use your face or fingerprint to unlock.</p>
          )}
        </div>
      </div>

      <div className="text-center">
        <button type="button" className="text-sm text-white/70 underline underline-offset-4" onClick={handleSignOut}>
          Sign out
        </button>
      </div>
    </div>
  );
}
