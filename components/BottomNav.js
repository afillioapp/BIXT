import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { setPendingCapture } from "../lib/pendingCapture";

// Floating dark pill nav, per "UI UX/Menu bar.jpg": three slots — Home,
// a raised center camera button, History. Settings no longer lives here
// (it's reached via the gear icon on the Home/History headers instead).
// The center button doesn't navigate directly; it opens a small popover
// with "Take photo" / "Import from gallery", each wrapping a hidden file
// input. Picking a file stashes it (lib/pendingCapture.js) and routes to
// /capture, which picks it up on mount.

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
    <svg width="24" height="21" viewBox="0 0 24 21">
      <path d="M8 3l1.6-2h4.8L16 3h4a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H2a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <circle cx="12" cy="11" r="4.4" fill="none" stroke="currentColor" strokeWidth="1.5" />
    </svg>
  );
}

const TABS = [
  { href: "/", icon: HomeIcon, label: "Home" },
  { href: "/history", icon: HistoryIcon, label: "History" },
];

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
        {TABS.slice(0, 1).map((tab) => {
          const active = router.pathname === tab.href;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`bottom-nav-item ${active ? "active" : ""}`}
              aria-label={tab.label}
              aria-current={active ? "page" : undefined}
            >
              <Icon />
            </Link>
          );
        })}

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
            className="bottom-nav-camera"
            aria-label="Add a receipt"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
          >
            <CameraIcon />
          </button>
        </div>

        {TABS.slice(1).map((tab) => {
          const active = router.pathname === tab.href;
          const Icon = tab.icon;
          return (
            <Link
              key={tab.href}
              href={tab.href}
              className={`bottom-nav-item ${active ? "active" : ""}`}
              aria-label={tab.label}
              aria-current={active ? "page" : undefined}
            >
              <Icon />
            </Link>
          );
        })}
      </nav>
    </>
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
