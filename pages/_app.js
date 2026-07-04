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

  // Firebase's auth check normally resolves almost instantly, but if its
  // local persistence layer ever hangs (corrupted IndexedDB, a flaky
  // browser, etc.), fail open to the login screen instead of a permanently
  // blank page — better than leaving a real visitor stuck with no way out.
  useEffect(() => {
    if (user !== undefined) return;
    const timer = setTimeout(() => {
      setUser((u) => (u === undefined ? null : u));
      if (!PUBLIC_ROUTES.includes(router.pathname)) router.replace("/login");
    }, 5000);
    return () => clearTimeout(timer);
  }, [user, router.pathname]);

  // Show nothing while checking auth to avoid flash
  if (user === undefined) return null;

  const showNav = !!user && !NO_NAV_ROUTES.includes(router.pathname);

  return (
    <div className="app-shell">
      <Component {...pageProps} user={user} />
      {showNav && <BottomNav />}
    </div>
  );
}
