import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import Head from "next/head";
import { Inter } from "next/font/google";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../lib/firebase";
import BottomNav from "../components/BottomNav";
import SplashLoader from "../components/SplashLoader";
import BiometricGate from "../components/BiometricGate";
import { getTheme, setTheme } from "../lib/theme";
import "../styles/globals.css";

// One typeface for everything (owner decision 2026-07-17, Lovable navy/teal
// handoff): Inter, replacing DM Sans. styles/globals.css points --font-sans
// AND --font-serif at this variable, so every existing rule restyles
// without edits.
const inter = Inter({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-inter",
  display: "swap",
});

const PUBLIC_ROUTES = ["/login"];
const NO_NAV_ROUTES = ["/login", "/setup"];

export default function App({ Component, pageProps }) {
  const router = useRouter();
  const [user, setUser] = useState(undefined); // undefined = loading

  // Apply whatever theme was last chosen in Settings. Runs after hydration
  // (client-only, localStorage-backed), so a brief light flash before this
  // fires is expected and acceptable.
  useEffect(() => {
    setTheme(getTheme());
  }, []);

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

  // Show the BX splash while checking auth, instead of a blank screen
  if (user === undefined) return <SplashLoader />;

  const showNav = !!user && !NO_NAV_ROUTES.includes(router.pathname);

  return (
    <>
      <Head>
        <title>BX</title>
        <link rel="icon" href="/favicon.svg" type="image/svg+xml" />
      </Head>
      <div className={`app-shell ${inter.variable}`}>
        <BiometricGate user={user}>
          <Component {...pageProps} user={user} />
          {showNav && <BottomNav />}
        </BiometricGate>
      </div>
    </>
  );
}
