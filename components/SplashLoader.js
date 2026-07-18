import Logo from "./Logo";

// Full-viewport splash shown while Firebase's auth check is still running
// (see pages/_app.js). Matches the navy screen family used by login/lock
// (pages/login.js, components/BiometricGate.js): navy background, white BX
// wordmark whose underline extends out to the left and right on a loop —
// the line IS the loading indicator (keyframes in styles/globals.css).
export default function SplashLoader() {
  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-brand-navy">
      <Logo size={44} animated onDark />
    </div>
  );
}
