// Wordmark logo: "BX" in the app's own DM Sans, with a rounded blue
// underline bar spanning the full width of the letters (owner spec
// 2026-07-10: line aligned with the letters' length, slightly bold).
// Pure inline styles (no CSS class) so it renders identically wherever it's
// dropped in; `animated` adds the splash-loader animation where the line
// extends out to the left and right (keyframes in styles/globals.css).
export default function Logo({ size = 32, animated = false }) {
  const underlineHeight = Math.max(4, Math.round(size * 0.15));

  return (
    <span
      style={{
        display: "inline-flex",
        flexDirection: "column",
        alignItems: "center",
        lineHeight: 1,
      }}
    >
      <span
        style={{
          fontFamily: "var(--font-sans)",
          fontWeight: 700,
          fontSize: size,
          color: "var(--text)",
          letterSpacing: "0.01em",
        }}
      >
        BX
      </span>
      <span
        aria-hidden="true"
        className={animated ? "logo-line-anim" : undefined}
        style={{
          display: "block",
          alignSelf: "stretch",
          height: underlineHeight,
          borderRadius: 999,
          background: "var(--highlight)",
          marginTop: Math.max(2, Math.round(size * 0.09)),
        }}
      />
    </span>
  );
}
