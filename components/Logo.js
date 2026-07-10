// Wordmark logo: "BX" in the app's own DM Sans, with a short rounded blue
// underline bar beneath it (per round-3 item 11/12 — replaces the plain
// text wordmark used on the splash screen, login screen, and lock screen).
// Pure inline styles (no CSS class) so it renders identically wherever it's
// dropped in, regardless of the wrapping element's own font-size/color rules.
export default function Logo({ size = 32 }) {
  const underlineWidth = Math.round(size * 0.62);
  const underlineHeight = Math.max(3, Math.round(size * 0.11));

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
        style={{
          display: "block",
          width: underlineWidth,
          height: underlineHeight,
          borderRadius: 999,
          background: "var(--highlight)",
          marginTop: Math.max(2, Math.round(size * 0.09)),
        }}
      />
    </span>
  );
}
