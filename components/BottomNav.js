import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { Home, Settings as SettingsIcon, Camera, Image as GalleryIcon } from "lucide-react";
import { setPendingCapture } from "../lib/pendingCapture";

// The bottom menu: Home | Camera | Settings as a small floating pill, icons
// only (owner requests 2026-10-24 and -25; it replaced the press-and-hold
// ThumbControl). Tapping the teal camera offers "Take photo" or "Choose
// photos" (several at once) just above it. Either way the File is
// handed to /capture through lib/pendingCapture.js, as before.
//
// Hidden on /login and /setup (pages/_app.js decides by route). Pages carry
// pb-28, which clears the bar.
//
// MUST stay under components/ — styles/tailwind.css is `source(none)` with
// only `@source "../pages"` and `@source "../components"`.

function NavTab({ href, icon: Icon, label, active }) {
  return (
    <Link
      href={href}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      className={`grid place-items-center size-11 rounded-full transition-colors ${
        active ? "text-brand-teal-deep bg-brand-teal-soft" : "text-text-tertiary hover:text-text-secondary"
      }`}
    >
      <Icon className="size-[22px]" strokeWidth={1.8} />
    </Link>
  );
}

export default function BottomNav() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  // Tap anywhere outside (touchstart too: mousedown alone misses on iOS) or
  // press Escape to close the photo menu.
  useEffect(() => {
    if (!open) return;
    function handleOutside(e) {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    }
    function handleEsc(e) {
      if (e.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    document.addEventListener("keydown", handleEsc);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
      document.removeEventListener("keydown", handleEsc);
    };
  }, [open]);

  // One photo from the camera, or several from the gallery (batch capture).
  function handleFileChosen(e) {
    const files = Array.from(e.target.files || []);
    e.target.value = "";
    if (!files.length) return;
    setPendingCapture(files);
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
        className="hidden"
      />
      <input id="bx-nav-import" type="file" accept="image/*" multiple onChange={handleFileChosen} className="hidden" />

      {open && <div className="fixed inset-0 z-40 bg-black/25" aria-hidden="true" />}

      {/* A small pill floating above the bottom edge (owner pick
          2026-10-25): icons only, the camera in the middle. */}
      <nav
        aria-label="Main"
        className="fixed left-1/2 -translate-x-1/2 z-40 flex items-center gap-3 rounded-full bg-surface/95 backdrop-blur-md p-1.5 shadow-lg shadow-black/10 ring-1 ring-hairline"
        style={{ bottom: "calc(env(safe-area-inset-bottom) + 16px)" }}
      >
        <NavTab href="/" icon={Home} label="Home" active={router.pathname === "/"} />

        <div className="relative" ref={wrapRef}>
          {open && (
            <div
              role="menu"
              aria-label="Add a receipt"
              className="absolute bottom-[calc(100%+14px)] left-1/2 -translate-x-1/2 w-56 rounded-2xl bg-surface p-1.5 shadow-xl ring-1 ring-hairline-strong z-50"
            >
              <label
                htmlFor="bx-nav-take-photo"
                role="menuitem"
                className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium text-text-primary active:bg-brand-teal-soft hover:bg-muted"
              >
                <Camera className="size-[18px] text-brand-teal-deep" />
                Take photo
              </label>
              <label
                htmlFor="bx-nav-import"
                role="menuitem"
                className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-medium text-text-primary active:bg-brand-teal-soft hover:bg-muted"
              >
                <GalleryIcon className="size-[18px] text-brand-teal-deep" />
                Choose photos
              </label>
            </div>
          )}
          <button
            type="button"
            aria-label="Add a receipt"
            aria-haspopup="menu"
            aria-expanded={open}
            onClick={() => setOpen((o) => !o)}
            className={`grid place-items-center size-12 rounded-full bg-brand-teal text-white shadow-md shadow-brand-teal/30 transition-transform active:scale-95 ${
              open ? "scale-105" : ""
            }`}
          >
            <Camera className="size-[22px]" />
          </button>
        </div>

        <NavTab href="/settings" icon={SettingsIcon} label="Settings" active={router.pathname === "/settings"} />
      </nav>
    </>
  );
}
