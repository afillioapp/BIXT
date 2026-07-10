import Logo from "./Logo";

// Full-viewport splash shown while Firebase's auth check is still running
// (see pages/_app.js). Centered BX logo whose underline extends out to the
// left and right on a loop — the line IS the loading indicator.
export default function SplashLoader() {
  return (
    <div className="splash-loader">
      <Logo size={44} animated />
    </div>
  );
}
