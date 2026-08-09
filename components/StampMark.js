// The approval stamp — a ring and a check, in the accent colour.
//
// This is the app's one moment of theatre: it lands on the photo the instant
// Claude's reading comes back, and it is the filing-drawer click made
// literal. Reusing the icon mark's ink/accent relationship rather than
// introducing a new glyph.
//
// Also used at rest on the empty capture screen, where it replaces a plain
// camera icon — so the screen you land on already shows you what is about to
// happen to your receipt.
//
// Inline SVG on purpose: no icon library gains anything here, and the check
// is a stroked path so it can share the ring's weight.
export default function StampMark({ size = 40, className, strokeWidth = 2.5 }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      className={className}
      role="img"
      aria-label="Filed"
    >
      <circle
        cx="24"
        cy="24"
        r="21"
        stroke="currentColor"
        strokeWidth={strokeWidth}
        opacity="0.45"
      />
      <circle cx="24" cy="24" r="17" stroke="currentColor" strokeWidth={strokeWidth} />
      <path
        d="M16 24.5 L21.5 30 L32 19"
        stroke="currentColor"
        strokeWidth={strokeWidth + 0.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
