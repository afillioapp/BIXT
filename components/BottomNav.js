import Link from "next/link";
import { useRouter } from "next/router";

// Camera sits in the middle as the raised primary action; the two secondary
// tabs flank it.
const TABS = [
  { href: "/history", icon: "🗂", label: "History" },
  { href: "/", icon: "📷", label: "Home", primary: true },
  { href: "/settings", icon: "⚙️", label: "Settings" },
];

export default function BottomNav() {
  const router = useRouter();

  return (
    <nav className="bottom-nav">
      {TABS.map((tab) => {
        const active = router.pathname === tab.href;
        if (tab.primary) {
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`bottom-nav-tab bottom-nav-primary ${active ? "active" : ""}`}
              aria-label={tab.label}
            >
              <span className="bottom-nav-primary-circle">
                <span className="bottom-nav-primary-icon">{tab.icon}</span>
              </span>
              <span className="bottom-nav-label">{tab.label}</span>
            </Link>
          );
        }
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`bottom-nav-tab ${active ? "active" : ""}`}
          >
            <span className="bottom-nav-icon">{tab.icon}</span>
            <span className="bottom-nav-label">{tab.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
