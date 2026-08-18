// The rounded-bottom dark header that tops every signed-in screen (Home,
// Insight, History, New receipt, Settings) — owner request, "the top part is
// dark on all pages". It was pasted identically into eight places across five
// pages; this is that exact block, extracted verbatim so the styling lives in
// one file.
//
// `tall` is the Settings identity header only: same block with pb-12 instead
// of pb-7, so the white chevron-row cards below it start noticeably lower.
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
    <div
      className={`bg-brand-navy rounded-b-3xl pt-10 ${
        tall ? "pb-12" : "pb-7"
      } text-white relative z-10 shadow-xl shadow-brand-navy/25`}
    >
      <div className="mx-auto max-w-md px-5">{children}</div>
    </div>
  );
}
