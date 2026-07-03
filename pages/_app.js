import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../lib/firebase";
import BottomNav from "../components/BottomNav";
import "../styles/globals.css";

const PUBLIC_ROUTES = ["/login"];
const NO_NAV_ROUTES = ["/login", "/setup"];

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const [user, setUser] = useState(undefined); // undefined = loading

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (u) => {
      setUser(u);
      if (!u && !PUBLIC_ROUTES.includes(router.pathname)) {
        router.replace("/login");
      }
    });
    return unsub;
  }, [router.pathname]);

  // Show nothing while checking auth to avoid flash
  if (user === undefined) return null;

  const showNav = !!user && !NO_NAV_ROUTES.includes(router.pathname);

  return (
    <>
      <div className="app-shell">
        <Component {...pageProps} user={user} />
        {showNav && <BottomNav />}
      </div>
      <div className="desktop-gate">
        <div className="desktop-gate-message">
          <div className="lp-logo" style={{ margin: "0 auto 16px" }}>B</div>
          <p>BIXT is designed for mobile.<br />Open it on your phone.</p>
        </div>
      </div>
    </>
  );
}
