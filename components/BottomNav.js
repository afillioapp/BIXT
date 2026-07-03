import Link from "next/link";
import { useRouter } from "next/router";

const TABS = [
  { href: "/", icon: "📷", label: "Camera" },
  { href: "/history", icon: "🗂", label: "History" },
  { href: "/settings", icon: "⚙️", label: "Settings" },
];

export default function BottomNav() {
  const router = useRouter();

  return (
    <nav className="bottom-nav">
      {TABS.map((tab) => {
        const active = router.pathname === tab.href;
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
