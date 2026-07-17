import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import {
  signInWithPopup,
  signInWithRedirect,
  getRedirectResult,
  GoogleAuthProvider,
  signInWithPhoneNumber,
  RecaptchaVerifier,
} from "firebase/auth";
import { ChevronLeft } from "lucide-react";
import { auth } from "../lib/firebase";
import Logo from "../components/Logo";

// Ported 1:1 from lovable-design/src/routes/signup.tsx's dark hero (this is
// intentionally OUR main sign-in screen, not their /login — see RESUME.md /
// the brief for why the two Lovable routes are swapped): teal-gradient BX
// tile, tagline + sub copy, one big teal pill. Apple is dropped entirely
// (owner decision); "Continue with Google" replaces "Create account" and
// wires the app's real signInPreferringPopup flow. The phone/OTP steps
// below aren't in the source design (BX has no such route there) — they're
// restyled in the same dark/teal language so the whole flow reads as one
// screen family.
const POPUP_FALLBACK_CODES = [
  "auth/popup-blocked",
  "auth/cancelled-popup-request",
  "auth/operation-not-supported-in-this-environment",
];

async function signInPreferringPopup(provider) {
  try {
    await signInWithPopup(auth, provider);
  } catch (err) {
    if (POPUP_FALLBACK_CODES.includes(err.code)) {
      await signInWithRedirect(auth, provider);
      return;
    }
    throw err;
  }
}

export default function Login() {
  const router = useRouter();
  const [step, setStep] = useState("main"); // 'main' | 'phone' | 'otp'
  const [phone, setPhone] = useState("");
  const [otp, setOtp] = useState("");
  const [confirmResult, setConfirmResult] = useState(null);
  const [loading, setLoading] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    const unsub = auth.onAuthStateChanged((user) => {
      if (user) router.replace("/");
    });
    return unsub;
  }, []);

  // Surfaces any error from a redirect-based sign-in that just completed
  // (e.g. returning from Google on mobile).
  useEffect(() => {
    getRedirectResult(auth).catch((err) => setError(err.message));
  }, []);

  function clearError() {
    setError("");
  }

  async function signInGoogle() {
    clearError();
    setLoading("google");
    try {
      const provider = new GoogleAuthProvider();
      await signInPreferringPopup(provider);
    } catch (err) {
      if (err.code !== "auth/popup-closed-by-user") setError(err.message);
    } finally {
      setLoading(null);
    }
  }

  async function sendOTP() {
    clearError();
    setLoading("phone");
    try {
      if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", { size: "invisible" });
      }
      const result = await signInWithPhoneNumber(auth, phone, window.recaptchaVerifier);
      setConfirmResult(result);
      setStep("otp");
    } catch (err) {
      setError(err.message);
      if (window.recaptchaVerifier) {
        window.recaptchaVerifier.clear();
        window.recaptchaVerifier = null;
      }
    } finally {
      setLoading(null);
    }
  }

  async function verifyOTP() {
    clearError();
    setLoading("verify");
    try {
      await confirmResult.confirm(otp);
    } catch {
      setError("Invalid code. Check and try again.");
    } finally {
      setLoading(null);
    }
  }

  return (
    <div className="min-h-dvh bg-brand-navy text-white flex flex-col px-8 pt-20 pb-10">
      {step === "main" && (
        <>
          <div className="flex-1 flex flex-col items-center justify-center">
            <div className="rounded-[36px] bg-gradient-to-br from-brand-teal/60 via-brand-teal/30 to-brand-navy p-10 shadow-2xl ring-1 ring-white/10">
              <Logo size={64} onDark />
            </div>
            <h1 className="mt-12 text-3xl font-semibold text-center leading-tight max-w-xs">
              Track every expense, anywhere.
            </h1>
            <p className="mt-3 text-sm text-white/60 text-center max-w-xs">
              The business expense tracker built for teams on the move.
            </p>
          </div>

          {error && (
            <div className="mb-4 rounded-xl bg-white/5 text-red-300 text-sm px-4 py-3 text-center">{error}</div>
          )}

          <div className="space-y-5">
            <button
              type="button"
              onClick={signInGoogle}
              disabled={!!loading}
              className="w-full rounded-full bg-brand-teal py-4 font-semibold text-brand-navy hover:opacity-90 transition disabled:opacity-60"
            >
              {loading === "google" ? "Signing in…" : "Continue with Google"}
            </button>

            <button
              type="button"
              onClick={() => {
                clearError();
                setStep("phone");
              }}
              disabled={!!loading}
              className="w-full text-sm text-white/70 underline underline-offset-4"
            >
              Continue with Phone
            </button>

            <p className="text-center text-xs text-white/40 leading-relaxed">
              By using BX you agree to our <a href="#" className="underline">Terms</a> and{" "}
              <a href="#" className="underline">Privacy Policy</a>
            </p>
          </div>
        </>
      )}

      {step === "phone" && (
        <>
          <button
            type="button"
            onClick={() => {
              clearError();
              setStep("main");
            }}
            aria-label="Back"
            className="self-start mb-8 text-white/70"
          >
            <ChevronLeft className="size-6" />
          </button>
          <h1 className="text-2xl font-semibold mb-2">What's your number?</h1>
          <p className="text-sm text-white/50 mb-7">We'll text you a 6-digit code.</p>
          <input
            className="w-full h-14 rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 text-base text-white placeholder:text-white/40 mb-4 focus:outline-none focus:ring-brand-teal/60"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(555) 123-4567"
            autoFocus
          />
          {error && <div className="rounded-xl bg-white/5 text-red-300 text-sm px-4 py-3 mb-4">{error}</div>}
          <div className="flex-1" />
          <button
            type="button"
            onClick={sendOTP}
            disabled={phone.length < 7 || loading === "phone"}
            className="w-full rounded-full bg-brand-teal py-4 font-semibold text-brand-navy hover:opacity-90 transition disabled:opacity-60"
          >
            {loading === "phone" ? "Sending…" : "Send code"}
          </button>
          <div id="recaptcha-container" />
        </>
      )}

      {step === "otp" && (
        <>
          <button
            type="button"
            onClick={() => {
              clearError();
              setStep("phone");
            }}
            aria-label="Back"
            className="self-start mb-8 text-white/70"
          >
            <ChevronLeft className="size-6" />
          </button>
          <h1 className="text-2xl font-semibold mb-2">Enter the code</h1>
          <p className="text-sm text-white/50 mb-7">Sent to {phone}</p>
          <input
            className="w-full h-14 rounded-2xl bg-white/5 ring-1 ring-white/10 px-4 text-center text-2xl tracking-[0.3em] text-white placeholder:text-white/40 mb-4 focus:outline-none focus:ring-brand-teal/60"
            type="number"
            value={otp}
            onChange={(e) => setOtp(e.target.value.slice(0, 6))}
            placeholder="000000"
            autoFocus
          />
          {error && <div className="rounded-xl bg-white/5 text-red-300 text-sm px-4 py-3 mb-4">{error}</div>}
          <div className="flex-1" />
          <button
            type="button"
            onClick={verifyOTP}
            disabled={otp.length < 6 || loading === "verify"}
            className="w-full rounded-full bg-brand-teal py-4 font-semibold text-brand-navy hover:opacity-90 transition disabled:opacity-60"
          >
            {loading === "verify" ? "Verifying…" : "Verify"}
          </button>
          <button
            type="button"
            onClick={() => {
              clearError();
              setStep("phone");
            }}
            className="mt-4 text-sm text-white/60 underline underline-offset-4 mx-auto"
          >
            Didn't get a code? Resend
          </button>
        </>
      )}
    </div>
  );
}
