// The top of every signed-in screen (Home, Insight, History, New receipt,
// Settings). It used to be a navy slab with a rounded skirt and a shadow,
// which read as a separate object sitting on top of the page rather than the
// start of it. It is now only spacing: the title sits on the same ground as
// the cards below it, in the same ink, and the page reads as one surface.
//
// Anything placed inside must be coloured for a light ground. The children
// were all written white-on-navy (text-white/60, bg-white/15, ring-white/20),
// and every one of those is invisible here.
//
// `tall` is the Settings identity header only: a little more room beneath, so
// the chevron-row cards start lower than the avatar block.
//
// MUST stay under components/ — styles/tailwind.css is `source(none)` with
// only `@source "../pages"` and `@source "../components"`, so a Tailwind class
// written outside those two trees emits no CSS at all and fails silently.
//
// Deliberately built with a template string rather than lib/cn — pulling
// clsx + tailwind-merge in here would add them to the bundle of every page
// that has a header (History gained 1 kB of First Load JS that way), and
// there are no conflicting classes to merge.
export default function PageHeader({ tall = false, children }) {
  return (
    <div className={`pt-10 ${tall ? "pb-8" : "pb-5"} relative z-10`}>
      <div className="mx-auto max-w-md px-5">{children}</div>
    </div>
  );
}
