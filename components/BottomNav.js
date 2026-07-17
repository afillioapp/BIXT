import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { setPendingCapture } from "../lib/pendingCapture";

// Fixed full-width translucent bottom bar, per lovable-design's
// BottomNav.tsx: 5 slots — Home, Stats, a raised center "+" (opens the
// take-photo/import popover, logic unchanged from before), History,
// Settings (folded back into the nav — the per-page header gear icon is
// gone, see pages/index.js & pages/history.js). Icons + 10px labels
// underneath; active tab = teal, inactive = muted.

function HomeIcon() {
  return (
    <svg width="20" height="19" viewBox="0 0 20 19">
      <path d="M1 8.5L10 1l9 7.5" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M3.5 7v10h13V7" stroke="currentColor" strokeWidth="1.6" fill="none" strokeLinejoin="round" />
    </svg>
  );
}

function StatsIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 19 19" fill="none">
      <path d="M2 17V10M9.5 17V3M17 17V12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
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

function SettingsIcon() {
  return (
    <svg width="19" height="19" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
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

function GalleryIcon() {
  return (
    <svg width="20" height="18" viewBox="0 0 20 18">
      <rect x="1" y="1" width="18" height="16" rx="2.5" fill="none" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="6.5" cy="6.5" r="1.8" fill="currentColor" />
      <path d="M2 14l5-5 4 4 3-3 4 4" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" strokeLinecap="round" />
    </svg>
  );
}

const LEFT_TABS = [
  { href: "/", icon: HomeIcon, label: "Home" },
  { href: "/stats", icon: StatsIcon, label: "Stats" },
];

const RIGHT_TABS = [
  { href: "/history", icon: HistoryIcon, label: "History" },
  { href: "/settings", icon: SettingsIcon, label: "Settings" },
];

function NavTab({ tab, active }) {
  const Icon = tab.icon;
  return (
    <Link
      href={tab.href}
      className={`bottom-nav-tab ${active ? "active" : ""}`}
      aria-label={tab.label}
      aria-current={active ? "page" : undefined}
    >
      <Icon />
      <span className="bottom-nav-tab-label">{tab.label}</span>
    </Link>
  );
}

export default function BottomNav() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    function handleOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [open]);

  function handleFileChosen(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setPendingCapture(file);
    setOpen(false);
    router.push("/capture");
  }

  return (
    <>
      <input
        id="bx-nav-take-photo"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChosen}
        className="hidden-input"
      />
      <input
        id="bx-nav-import"
        type="file"
        accept="image/*"
        onChange={handleFileChosen}
        className="hidden-input"
      />

      <nav className="bottom-nav">
        <div className="bottom-nav-grid">
          {LEFT_TABS.map((tab) => (
            <NavTab key={tab.href} tab={tab} active={router.pathname === tab.href} />
          ))}

          <div className="bottom-nav-center-wrap" ref={wrapRef}>
            {open && (
              <div className="capture-popover">
                <label htmlFor="bx-nav-take-photo" className="capture-popover-card capture-popover-photo">
                  <CameraIcon />
                  Take photo
                </label>
                <label htmlFor="bx-nav-import" className="capture-popover-card capture-popover-import">
                  <GalleryIcon />
                  Import from gallery
                </label>
              </div>
            )}
            <button
              type="button"
              className="bottom-nav-fab"
              aria-label="Add a receipt"
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
            >
              <PlusIcon />
            </button>
          </div>

          {RIGHT_TABS.map((tab) => (
            <NavTab key={tab.href} tab={tab} active={router.pathname === tab.href} />
          ))}
        </div>
      </nav>
    </>
  );
}

function PlusIcon() {
  return (
    <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
      <path d="M12 5v14M5 12h14" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}
