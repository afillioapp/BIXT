import Link from "next/link";
import { useRouter } from "next/router";
import { useEffect, useRef, useState } from "react";
import { Home, BarChart3, Plus, History as HistoryIcon, User, Camera, Image as GalleryIcon } from "lucide-react";
import { setPendingCapture } from "../lib/pendingCapture";

// Ported 1:1 from lovable-design/src/components/BottomNav.tsx: fixed
// full-width translucent (backdrop-blur) bar, 5-column grid, a raised
// bg-brand-navy "+" fab overhanging the top, teal for the active tab /
// zinc-400 for inactive. Our slots: Home /, Stats /stats, the center "+"
// (unchanged take-photo/import popover logic — round 5 restyled the popover
// itself as a side-by-side teal/navy pair sitting higher above the fab),
// History /history (their "Cards" slot — icon swapped for lucide's History
// glyph, label "History"), Settings /settings (their "Profile" slot, label
// "Settings", User icon kept).
const LEFT_TABS = [
  { href: "/", icon: Home, label: "Home" },
  { href: "/stats", icon: BarChart3, label: "Stats" },
];

const RIGHT_TABS = [
  { href: "/history", icon: HistoryIcon, label: "History" },
  { href: "/settings", icon: User, label: "Settings" },
];

function NavTab({ tab, active }) {
  const Icon = tab.icon;
  return (
    <Link
      href={tab.href}
      aria-label={tab.label}
      aria-current={active ? "page" : undefined}
      className={`flex flex-col items-center gap-1 ${active ? "text-brand-teal" : "text-zinc-400"}`}
    >
      <Icon className="size-5" />
      <span className="text-[10px] font-medium">{tab.label}</span>
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
        className="hidden"
      />
      <input
        id="bx-nav-import"
        type="file"
        accept="image/*"
        onChange={handleFileChosen}
        className="hidden"
      />

      <nav className="fixed bottom-0 inset-x-0 z-40 h-20 bg-surface/85 backdrop-blur-md border-t border-black/5">
        <div className="mx-auto max-w-md h-full grid grid-cols-5 items-center px-4">
          {LEFT_TABS.map((tab) => (
            <NavTab key={tab.href} tab={tab} active={router.pathname === tab.href} />
          ))}

          <div className="flex justify-center relative" ref={wrapRef}>
            {open && (
              <div className="absolute bottom-[calc(100%+46px)] left-1/2 -translate-x-1/2 flex items-center gap-3 z-50">
                <label
                  htmlFor="bx-nav-take-photo"
                  className="flex items-center gap-2.5 whitespace-nowrap rounded-xl bg-brand-teal text-white px-7 py-4 text-base font-semibold shadow-xl cursor-pointer active:scale-95 transition-transform"
                >
                  <Camera className="size-5" /> Scan
                </label>
                <label
                  htmlFor="bx-nav-import"
                  className="flex items-center gap-2.5 whitespace-nowrap rounded-xl bg-brand-navy text-white px-7 py-4 text-base font-semibold shadow-xl cursor-pointer active:scale-95 transition-transform"
                >
                  <GalleryIcon className="size-5" /> Gallery
                </label>
              </div>
            )}
            <button
              type="button"
              aria-label="Add a receipt"
              aria-expanded={open}
              onClick={() => setOpen((o) => !o)}
              className="-mt-8 size-14 rounded-2xl bg-brand-navy text-white shadow-xl shadow-brand-navy/25 flex items-center justify-center active:scale-95 transition-transform"
            >
              <Plus className="size-6" />
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
