// The rounded-bottom dark header that tops every signed-in screen (Home,
// Insight, History, New receipt, Settings) — owner request, "the top part is
// dark on all pages". The same block used to be pasted into eight places
// across five pages; it lives here now so its colour is one edit, not five.
//
// Colour is "Deep Pine" (owner-approved, replacing the rejected navy): a
// subtle top-to-bottom lift so the bar reads as a surface rather than a flat
// slab. The tokens are defined in styles/tailwind.css.
//
// `tall` is the Settings identity header only: same block with pb-12 instead
// of pb-7, so the white chevron-row cards below it start noticeably lower.
//
// MUST stay under components/ — styles/tailwind.css is `source(none)` with
// only `@source "../pages"` and `@source "../components"`, so a Tailwind class
// written outside those two trees emits no CSS at all and fails silently.
//
// Built with a template string rather than lib/cn on purpose: clsx +
// tailwind-merge would then be pulled into the bundle of every page that has
// a header, and there are no conflicting classes here to merge.
export default function PageHeader({ tall = false, children }) {
  return (
    <div
      className={`bg-linear-to-b from-brand-pine-lift to-brand-pine rounded-b-3xl pt-10 ${
        tall ? "pb-12" : "pb-7"
      } text-white relative z-10 shadow-xl shadow-brand-pine/25`}
    >
      <div className="mx-auto max-w-md px-5">{children}</div>
    </div>
  );
}
