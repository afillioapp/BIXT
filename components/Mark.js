// The BX icon mark, inline — a rounded tile with its top-right corner turned
// down (a dog-eared receipt), the BX monogram set centre-left to balance the
// fold, and an accent tear-line beneath.
//
// This is the same geometry as public/favicon.svg and public/favicon-dark.svg.
// **If you change a path here, regenerate those two files to match** — the
// previous brand drifted precisely because the favicon and the in-app logo
// were two separate implementations of the same idea.
//
// The monogram is outlined paths, never a <text> element: glyphs would render
// in whatever font the host resolves, and metrics differ enough across
// platforms to push the letters off centre.
//
// Two flat colour states, one shape — never a second geometry (brand doc §11).
// Colours come from tokens, so the mark follows the theme:
//   tone="ink"   — ink tile, paper monogram. For light surfaces.
//   tone="paper" — paper tile, ink monogram. For the ink hero screens.
const TILE =
  "M22,0 L66,0 L96,30 L96,74 A22,22 0 0 1 74,96 L22,96 A22,22 0 0 1 0,74 L0,22 A22,22 0 0 1 22,0 Z";
const FOLD = "M66,0 L96,0 L96,30 Z";
const B =
  "M14,28 H30 A8,8 0 0 1 30,44 H32 A10,10 0 0 1 32,64 H14 Z M22,33.5 H30.5 A4.25,4.25 0 0 1 30.5,42 H22 Z M22,49 H32 A5,5 0 0 1 32,59 H22 Z";
const X =
  "M47,28 L55.4,28 L61,37.5 L66.6,28 L75,28 L65.6,46 L75,64 L66.6,64 L61,54.5 L55.4,64 L47,64 L56.4,46 Z";

export default function Mark({ size = 96, tone = "ink", className }) {
  const tile = tone === "paper" ? "var(--ink-foreground)" : "var(--brand-navy)";
  const contrast = tone === "paper" ? "var(--brand-navy)" : "var(--ink-foreground)";

  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 96 96"
      className={className}
      role="img"
      aria-label="BX"
    >
      <path d={TILE} fill={tile} />
      <path d={FOLD} fill={contrast} />
      {/* The crease is a bonus that quietly vanishes below ~32px. */}
      <line
        x1="66"
        y1="0"
        x2="96"
        y2="30"
        stroke={tile}
        strokeWidth="1.5"
        strokeOpacity="0.18"
      />
      <path fillRule="evenodd" fill={contrast} d={B} />
      <path fill={contrast} d={X} />
      <rect x="26.5" y="70" width="36" height="6" rx="3" fill="var(--brand-teal)" />
    </svg>
  );
}
