import Link from "next/link";
import { useRouter } from "next/router";

// Floating dark pill nav (owner override on the handoff's raised-circle tab
// bar): one centered #111 pill with four equal items — Home, History,
// Capture, Settings. Inactive items are white line icons only; the active
// item expands into a lighter inner chip showing icon + label. Hide rules
// are unchanged (pages/_app.js decides by route).

function HomeIcon() {
  return (
    <svg width="20" height="19" viewBox="0 0 20 19">
      <path d="M1 8.5L10 1l9 7.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.5 7v10h13V7" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinejoin="round" />
    </svg>
  );
}

function HistoryIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 19 19">
      <circle cx="9.5" cy="9.5" r="8.3" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9.5 5v5l3.5 2" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" />
    </svg>
  );
}

function CameraIcon() {
  return (
    <svg width="22" height="19" viewBox="0 0 24 21">
      <path d="M8 3l1.6-2h4.8L16 3h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="12" cy="11" r="4.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

function SettingsIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 19 19">
      <circle cx="9.5" cy="9.5" r="2.6" fill="none" stroke="currentColor" strokeWidth="1.6" />
      <path d="M9.5 1.5v2.4M9.5 15.1v2.4M17.5 9.5h-2.4M4.4 9.5H2M15.1 3.9l-1.7 1.7M5.6 13.4l-1.7 1.7M15.1 15.1l-1.7-1.7M5.6 5.6L3.9 3.9" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" />
    </svg>
  );
}

const TABS = [
  { href: "/", icon: HomeIcon, label: "Home" },
  { href: "/history", icon: HistoryIcon, label: "History" },
  { href: "/capture", icon: CameraIcon, label: "Capture", ariaLabel: "Capture receipt" },
  { href: "/settings", icon: SettingsIcon, label: "Settings" },
];

export default function BottomNav() {
  const router = useRouter();

  return (
    <nav className="bottom-nav">
      {TABS.map((tab) => {
        const active = router.pathname === tab.href;
        const Icon = tab.icon;
        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={`bottom-nav-item ${active ? "active" : ""}`}
            aria-label={tab.ariaLabel || tab.label}
            aria-current={active ? "page" : undefined}
          >
            <Icon />
          </Link>
        );
      })}
    </nav>
  );
}
