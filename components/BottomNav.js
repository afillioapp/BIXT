import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { Home, Settings as SettingsIcon, Camera, Image as GalleryIcon } from "lucide-react";
import { setPendingCapture } from "../lib/pendingCapture";

// The bottom bar (owner request 2026-10-24, replacing the press-and-hold
// ThumbControl, which the owner found impractical): Home | Camera | Settings.
// The camera sits raised in the middle in the brand accent; tapping it offers
// "Take photo" or "Choose a photo" just above it. Either way the File is
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
      aria-current={active ? "page" : undefined}
      className={`flex flex-col items-center justify-center gap-1 h-full ${active ? "text-brand-teal-deep" : "text-text-tertiary"}`}
    >
      <Icon className="size-5" />
      <span className="text-[11px] font-medium">{label}</span>
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
        className="hidden"
      />
      <input id="bx-nav-import" type="file" accept="image/*" onChange={handleFileChosen} className="hidden" />

      {open && <div className="fixed inset-0 z-40 bg-black/25" aria-hidden="true" />}

      <nav
        aria-label="Main"
        className="fixed bottom-0 inset-x-0 z-40 bg-surface/90 backdrop-blur-md border-t border-hairline pb-[env(safe-area-inset-bottom)]"
      >
        <div className="mx-auto max-w-md h-16 grid grid-cols-3 items-center px-6">
          <NavTab href="/" icon={Home} label="Home" active={router.pathname === "/"} />

          <div className="relative flex justify-center" ref={wrapRef}>
            {open && (
              <div
                role="menu"
                aria-label="Add a receipt"
                className="absolute bottom-[calc(100%+40px)] left-1/2 -translate-x-1/2 w-56 rounded-2xl bg-surface p-1.5 shadow-xl ring-1 ring-hairline-strong z-50"
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
                  Choose a photo
                </label>
              </div>
            )}
            <button
              type="button"
              aria-label="Add a receipt"
              aria-haspopup="menu"
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
              className={`-mt-9 size-16 rounded-full bg-brand-teal text-white shadow-xl shadow-brand-teal/30 ring-4 ring-background flex items-center justify-center transition-transform active:scale-95 ${
                open ? "scale-105" : ""
              }`}
            >
              <Camera className="size-7" />
            </button>
          </div>

          <NavTab href="/settings" icon={SettingsIcon} label="Settings" active={router.pathname === "/settings"} />
        </div>
      </nav>
    </>
  );
}
