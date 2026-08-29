import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/router";
import { Camera, Image as GalleryIcon, Settings as SettingsIcon, Sun, Moon } from "lucide-react";
import { setPendingCapture } from "../lib/pendingCapture";
import { getTheme, setTheme } from "../lib/theme";

// Replaces components/BottomNav.js. The 5-slot bar was 80px of chrome drawn on
// every screen to reach four places, two of which (Insight, History) are now
// widgets on Home — the carousel and the receipt list — so they no longer need
// a tab at all. What is left is capture, gallery, settings and the theme, and
// all four fit inside the one control that was already under the thumb.
//
// Tap  = take a photo. The dominant action gets the whole button, with no
//        popover step in front of it.
// Hold = the rest. 450ms opens a menu anchored to the button itself, so the
//        thumb never leaves the corner it is already in.
//
// The capture path is unchanged from BottomNav: the same two hidden inputs
// (a camera one and a library one), the same handoff through
// lib/pendingCapture.js, the same router.push("/capture"). Only what triggers
// them moved.
//
// Positioned bottom-right for a right thumb. Every offset is on this one
// element, so a later Dominant hand setting flips `right-5` to `left-5` and
// the menu's anchor with it, and nothing else in the app has to move.
//
// Pages already carry pb-28 from the old nav, which is the run-out the button
// needs to stay clear of the last row — so no page padding changed.
//
// MUST stay under components/ — styles/tailwind.css is `source(none)` with
// only `@source "../pages"` and `@source "../components"`, so a Tailwind class
// written outside those two trees emits no CSS at all and fails silently.

const HOLD_MS = 450;

export default function ThumbControl() {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [dark, setDark] = useState(false);
  const wrapRef = useRef(null);
  const timerRef = useRef(null);
  const heldRef = useRef(false);

  useEffect(() => {
    setDark(getTheme() === "dark");
  }, []);

  // tap anywhere outside to dismiss, same listener pair BottomNav used for its
  // popover (touchstart included — mousedown alone misses on iOS Safari)
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

  useEffect(() => () => clearTimeout(timerRef.current), []);

  function handleFileChosen(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setPendingCapture(file);
    setOpen(false);
    router.push("/capture");
  }

  function pressStart() {
    if (open) return;
    heldRef.current = false;
    timerRef.current = setTimeout(() => {
      heldRef.current = true;
      setOpen(true);
    }, HOLD_MS);
  }

  // the camera input is opened from pointerup, which is still inside the user
  // gesture, so the file picker is allowed to open
  function pressEnd() {
    clearTimeout(timerRef.current);
    if (heldRef.current || open) return;
    document.getElementById("bx-thumb-take-photo")?.click();
  }

  function pressCancel() {
    clearTimeout(timerRef.current);
  }

  function toggleTheme() {
    const next = dark ? "light" : "dark";
    setTheme(next);
    setDark(!dark);
    setOpen(false);
  }

  return (
    <>
      <input
        id="bx-thumb-take-photo"
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChosen}
        className="hidden"
      />
      <input
        id="bx-thumb-import"
        type="file"
        accept="image/*"
        onChange={handleFileChosen}
        className="hidden"
      />

      {open && (
        <div
          className="fixed inset-0 z-40 bg-black/25 backdrop-blur-[1px]"
          aria-hidden="true"
        />
      )}

      <div ref={wrapRef} className="fixed bottom-6 right-5 z-50">
        {open && (
          <div
            role="menu"
            aria-label="Receipt options"
            className="absolute bottom-[calc(100%+12px)] right-0 w-52 origin-bottom-right rounded-2xl bg-surface p-1.5 shadow-xl ring-1 ring-black/10"
          >
            <label
              htmlFor="bx-thumb-import"
              role="menuitem"
              className="flex cursor-pointer items-center gap-3 rounded-xl px-3 py-2.5 text-[15px] font-medium text-text-primary active:bg-brand-teal-soft"
            >
              <GalleryIcon className="size-[18px] text-brand-teal" />
              Choose a photo
            </label>

            <button
              type="button"
              role="menuitem"
              onClick={toggleTheme}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] font-medium text-text-primary active:bg-brand-teal-soft"
            >
              {dark ? (
                <Sun className="size-[18px] text-brand-teal" />
              ) : (
                <Moon className="size-[18px] text-brand-teal" />
              )}
              Appearance
              <span className="ml-auto text-xs text-text-secondary">
                {dark ? "Dark" : "Light"}
              </span>
            </button>

            <button
              type="button"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                router.push("/settings");
              }}
              className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-[15px] font-medium text-text-primary active:bg-brand-teal-soft"
            >
              <SettingsIcon className="size-[18px] text-brand-teal" />
              Settings
            </button>
          </div>
        )}

        <button
          type="button"
          aria-label="Take a photo of a receipt. Press and hold for more."
          aria-expanded={open}
          aria-haspopup="menu"
          onPointerDown={pressStart}
          onPointerUp={pressEnd}
          onPointerLeave={pressCancel}
          onPointerCancel={pressCancel}
          onContextMenu={(e) => e.preventDefault()}
          onKeyDown={(e) => {
            if (e.key === " ") {
              e.preventDefault();
              setOpen(true);
            }
          }}
          className={`size-16 touch-none select-none rounded-full bg-brand-navy text-white shadow-xl shadow-brand-navy/30 ring-4 ring-background transition-transform active:scale-95 dark:bg-brand-teal dark:text-brand-navy flex items-center justify-center ${
            open ? "scale-105" : ""
          }`}
        >
          <Camera className="size-7" />
        </button>
      </div>
    </>
  );
}
