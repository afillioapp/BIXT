// Full-viewport splash shown while Firebase's auth check is still running
// (see pages/_app.js). Replaces the old blank-screen flash with the BX logo
// so the app never appears to hang on load.
export default function SplashLoader() {
  return (
    <div className="splash-loader">
      <img src="/bx-logo.svg" alt="BX" className="splash-loader-logo" />
    </div>
  );
}
