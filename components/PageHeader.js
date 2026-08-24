// The top of every signed-in screen (Home, Insight, History, New receipt,
// Settings). It used to be a navy slab with a rounded skirt and a shadow,
// which read as a separate object sitting on top of the page rather than the
// start of it.
//
// It is now the same card as everything under it: bg-white, rounded-2xl,
// ring-1 ring-black/5, the idiom every other card on Home and Insight uses. So
// the screen is one stack of cards on one ground from the top down, and the
// header is the first of them rather than a different kind of thing.
//
// Its outer padding pairs with the `pt-6` the content below carries, so the
// gap under the card matches the gap between the cards.
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
    <div className="pt-6 relative z-10">
      <div className="mx-auto max-w-md px-5">
        <div
          className={`bg-white rounded-2xl ${
            tall ? "p-6" : "p-5"
          } ring-1 ring-black/5`}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
