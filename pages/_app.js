import { useEffect, useState } from "react";
import { useRouter } from "next/router";
import { onAuthStateChanged } from "firebase/auth";
import { auth } from "../lib/firebase";
import "../styles/globals.css";

const PUBLIC_ROUTES = ["/login"];

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

  return <Component {...pageProps} user={user} />;
}
