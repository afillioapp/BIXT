import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import {
  signInWithPopup,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPhoneNumber,
  RecaptchaVerifier,
} from "firebase/auth";
import { auth } from "../lib/firebase";

export default function Login() {
  const router = useRouter();
  const [step, setStep] = useState("options"); // 'options' | 'phone' | 'otp'
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

  function clearError() { setError(""); }

  async function signInGoogle() {
    clearError(); setLoading("google");
    try {
      const provider = new GoogleAuthProvider();
      provider.addScope("https://www.googleapis.com/auth/drive.file");
      provider.addScope("https://www.googleapis.com/auth/spreadsheets");
      await signInWithPopup(auth, provider);
    } catch (err) {
      if (err.code !== "auth/popup-closed-by-user") setError(err.message);
    } finally { setLoading(null); }
  }

  async function signInApple() {
    clearError(); setLoading("apple");
    try {
      const provider = new OAuthProvider("apple.com");
      await signInWithPopup(auth, provider);
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
      <div className="lp-card">

        {/* Brand */}
        <div className="lp-brand">
          <div className="lp-logo">B</div>
          <span className="lp-app-name">BIXT</span>
        </div>

        {step === "options" && (
          <>
            <h1 className="lp-heading">Welcome</h1>
            <p className="lp-sub">Sign in or create your account to start tracking expenses.</p>

            <button className="lp-btn lp-btn-google" onClick={signInGoogle} disabled={!!loading}>
              {loading === "google" ? "Signing in…" : <><GoogleIcon /> Continue with Google</>}
            </button>

            <button className="lp-btn lp-btn-apple" onClick={signInApple} disabled={!!loading}>
              {loading === "apple" ? "Signing in…" : <><AppleIcon /> Continue with Apple</>}
            </button>

            <div className="lp-divider"><span>or</span></div>

            <button className="lp-btn lp-btn-phone" onClick={() => { clearError(); setStep("phone"); }} disabled={!!loading}>
              <PhoneIcon /> Continue with Phone
            </button>

            {error && <p className="lp-error">{error}</p>}

            <p className="lp-terms">
              By continuing you agree to BIXT's <a href="#">Terms</a> &amp; <a href="#">Privacy Policy</a>.
            </p>
          </>
        )}

        {step === "phone" && (
          <>
            <button className="lp-back" onClick={() => { clearError(); setStep("options"); }}>← Back</button>
            <h1 className="lp-heading">Your phone number</h1>
            <p className="lp-sub">We'll send a one-time code to verify it's you.</p>
            <label className="lp-label">Phone number</label>
            <input
              className="lp-input"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+1 416 555 0100"
              autoFocus
            />
            <button
              className="lp-btn lp-btn-primary"
              onClick={sendOTP}
              disabled={phone.length < 7 || loading === "phone"}
            >
              {loading === "phone" ? "Sending…" : "Send Code"}
            </button>
            {error && <p className="lp-error">{error}</p>}
            <div id="recaptcha-container" />
          </>
        )}

        {step === "otp" && (
          <>
            <button className="lp-back" onClick={() => { clearError(); setStep("phone"); }}>← Back</button>
            <h1 className="lp-heading">Enter the code</h1>
            <p className="lp-sub">6-digit code sent to <strong>{phone}</strong></p>
            <input
              className="lp-input lp-otp"
              type="number"
              value={otp}
              onChange={(e) => setOtp(e.target.value.slice(0, 6))}
              placeholder="· · · · · ·"
              autoFocus
            />
            <button
              className="lp-btn lp-btn-primary"
              onClick={verifyOTP}
              disabled={otp.length < 6 || loading === "verify"}
            >
              {loading === "verify" ? "Verifying…" : "Verify & Sign In"}
            </button>
            <button className="lp-resend" onClick={() => { clearError(); setStep("phone"); }}>
              Didn't get a code? Resend
            </button>
            {error && <p className="lp-error">{error}</p>}
          </>
        )}
      </div>
    </div>
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

function AppleIcon() {
  return (
    <svg width="16" height="19" viewBox="0 0 17 20" fill="currentColor">
      <path d="M13.769 10.561c-.02-2.193 1.794-3.254 1.876-3.307-1.023-1.496-2.614-1.7-3.178-1.722-1.347-.137-2.638.797-3.322.797-.685 0-1.73-.779-2.847-.757-1.455.021-2.804.847-3.553 2.147C1.17 10.24 2.2 14.394 3.77 16.64c.782 1.103 1.703 2.337 2.912 2.292 1.175-.047 1.617-.749 3.037-.749 1.42 0 1.822.749 3.063.725 1.262-.02 2.058-1.117 2.832-2.225.896-1.272 1.264-2.506 1.283-2.571-.028-.011-2.456-.939-2.477-3.551h-.651zM11.53 3.77C12.16 3.004 12.59 1.952 12.47.88c-.904.038-2 .603-2.648 1.368-.583.673-1.093 1.75-.956 2.782.996.078 2.02-.497 2.663-1.26z"/>
    </svg>
  );
}

function PhoneIcon() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
      <rect x="5" y="2" width="14" height="20" rx="2"/>
      <circle cx="12" cy="17" r="1" fill="currentColor"/>
    </svg>
  );
}
