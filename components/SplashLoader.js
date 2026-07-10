import Logo from "./Logo";

// Full-viewport splash shown while Firebase's auth check is still running
// (see pages/_app.js). Replaces the old blank-screen flash so the app never
// appears to hang on load. Centered BX logo (components/Logo.js), pulsing
// while auth resolves.
export default function SplashLoader() {
  return (
    <div className="splash-loader">
      <div className="splash-loader-wordmark">
        <Logo size={36} />
      </div>
    </div>
  );
}
