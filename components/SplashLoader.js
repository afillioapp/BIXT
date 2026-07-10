// Full-viewport splash shown while Firebase's auth check is still running
// (see pages/_app.js). Replaces the old blank-screen flash so the app never
// appears to hang on load. Per the design handoff: a centered serif "BXT"
// wordmark, no logo image.
export default function SplashLoader() {
  return (
    <div className="splash-loader">
      <div className="splash-loader-wordmark">BXT</div>
    </div>
  );
}
