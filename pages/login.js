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
import { auth } from "../lib/firebase";

// Try the popup flow first everywhere — it's the only flow that works
// reliably now that Safari/Chrome block third-party storage — and fall back
// to the full-page redirect only when the browser refuses the popup outright.
// (The redirect flow additionally relies on next.config.js proxying
// /__/auth/* so the sign-in helper is same-site.)
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
  // Splash's "Sign In / Sign Up" split was copy-only — both revealed the
  // same three providers, so it's dropped in favor of showing them directly.
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
  // (e.g. returning from Google/Apple on mobile).
  useEffect(() => {
    getRedirectResult(auth).catch((err) => setError(err.message));
  }, []);

  function clearError() { setError(""); }

  async function signInGoogle() {
    clearError(); setLoading("google");
    try {
      const provider = new GoogleAuthProvider();
      await signInPreferringPopup(provider);
    } catch (err) {
      if (err.code !== "auth/popup-closed-by-user") setError(err.message);
    } finally { setLoading(null); }
  }

  async function sendOTP() {
    clearError(); setLoading("phone");
    try {
      if (!window.recaptchaVerifier) {
        window.recaptchaVerifier = new RecaptchaVerifier(auth, "recaptcha-container", { size: "invisible" });
      }
      const result = await signInWithPhoneNumber(auth, phone, window.recaptchaVerifier);
      setConfirmResult(result);
      setStep("otp");
    } catch (err) {
      setError(err.message);
      if (window.recaptchaVerifier) { window.recaptchaVerifier.clear(); window.recaptchaVerifier = null; }
    } finally { setLoading(null); }
  }

  async function verifyOTP() {
    clearError(); setLoading("verify");
    try {
      await confirmResult.confirm(otp);
    } catch {
      setError("Invalid code. Check and try again.");
    } finally { setLoading(null); }
  }

  return (
    <div className="lp-bg">
      {step === "main" && (
        <>
          {/* Soft floating shapes behind everything, per the login mockup. */}
          <div className="lp-shapes" aria-hidden="true">
            <div className="lp-shape" />
            <div className="lp-shape" />
            <div className="lp-shape" />
            <div className="lp-shape" />
          </div>

          {/* Brand — text wordmark only, no logo image (design handoff). */}
          <div className="lp-wordmark">BXT</div>

          <div className="lp-hero">
            <h1 className="lp-tagline">Every receipt,<br />filed by itself.</h1>
          </div>

          {/* A failed redirect sign-in lands back on this main step — the
              error must be visible here or it silently disappears. */}
          {error && <div className="lp-error">{error}</div>}

          <div className="lp-buttons">
            <button className="btn btn-primary" onClick={signInGoogle} disabled={!!loading}>
              {loading === "google" ? "Signing in…" : <><GoogleIcon /> Continue with Google</>}
            </button>

            <button className="btn lp-btn-phone" onClick={() => { clearError(); setStep("phone"); }} disabled={!!loading}>
              Continue with Phone
            </button>
          </div>

          <p className="lp-terms">
            By using BXT you agree to our <a href="#">Terms</a> and <a href="#">Privacy Policy</a>
          </p>
        </>
      )}

      {step === "phone" && (
        <>
          <button className="lp-back" onClick={() => { clearError(); setStep("main"); }} aria-label="Back">
            <BackChevron />
          </button>
          <h1 className="lp-heading">What's your number?</h1>
          <p className="lp-sub-tight">We'll text you a 6-digit code.</p>
          <input
            className="lp-input"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="(555) 123-4567"
            autoFocus
          />
          {error && <div className="lp-error">{error}</div>}
          <div className="lp-spacer" />
          <button
            className="btn btn-primary"
            onClick={sendOTP}
            disabled={phone.length < 7 || loading === "phone"}
          >
            {loading === "phone" ? "Sending…" : "Send code"}
          </button>
          <div id="recaptcha-container" />
        </>
      )}

      {step === "otp" && (
        <>
          <button className="lp-back" onClick={() => { clearError(); setStep("phone"); }} aria-label="Back">
            <BackChevron />
          </button>
          <h1 className="lp-heading">Enter the code</h1>
          <p className="lp-sub-tight">Sent to {phone}</p>
          <input
            className="lp-input lp-otp"
            type="number"
            value={otp}
            onChange={(e) => setOtp(e.target.value.slice(0, 6))}
            placeholder="000000"
            autoFocus
          />
          {error && <div className="lp-error">{error}</div>}
          <div className="lp-spacer" />
          <button
            className="btn btn-primary"
            onClick={verifyOTP}
            disabled={otp.length < 6 || loading === "verify"}
          >
            {loading === "verify" ? "Verifying…" : "Verify"}
          </button>
          <button className="quiet-link lp-resend" onClick={() => { clearError(); setStep("phone"); }}>
            Didn't get a code? Resend
          </button>
        </>
      )}
    </div>
  );
}

function BackChevron() {
  return (
    <svg width="10" height="17" viewBox="0 0 10 17">
      <path d="M9 1L1 8.5 9 16" stroke="var(--text)" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function GoogleIcon() {
  return (
    <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
      <path d="M17.64 9.2c0-.637-.057-1.251-.164-1.84H9v3.481h4.844c-.209 1.125-.843 2.078-1.796 2.717v2.258h2.908C16.658 14.013 17.64 11.705 17.64 9.2z" fill="#4285F4"/>
      <path d="M9 18c2.43 0 4.467-.806 5.956-2.18l-2.908-2.259c-.806.54-1.837.86-3.048.86-2.344 0-4.328-1.584-5.036-3.711H.957v2.332A8.997 8.997 0 0 0 9 18z" fill="#34A853"/>
      <path d="M3.964 10.71A5.41 5.41 0 0 1 3.682 9c0-.593.102-1.17.282-1.71V4.958H.957A8.996 8.996 0 0 0 0 9c0 1.452.348 2.827.957 4.042l3.007-2.332z" fill="#FBBC05"/>
      <path d="M9 3.58c1.321 0 2.508.454 3.44 1.345l2.582-2.58C13.463.891 11.426 0 9 0A8.997 8.997 0 0 0 .957 4.958L3.964 7.29C4.672 5.163 6.656 3.58 9 3.58z" fill="#EA4335"/>
    </svg>
  );
}

