import { cn } from "../lib/cn";

// The in-app "BX" wordmark — the login hero and BiometricGate, and nowhere
// else at brand-statement scale.
//
// Deliberately NOT the same artwork as the icon mark in public/favicon.svg:
// putting the square icon tile next to the letters "BX" would just read
// "BX BX". This is the letterform alone, sharing the icon's weight and
// proportions but set larger and without the tile.
//
// The underline is a *dashed* rule in the accent colour — a perforated
// tear-line under the letters, like the one on a receipt, rather than the
// solid bar this used to draw. `border-t-[3px] border-dashed` is a static
// class, so Tailwind's scanner sees it; the dash pattern is browser-native
// and costs nothing.
//
// Call sites pass a raw pixel `size` (40 in BiometricGate, 64 on the login
// hero), so sizing is inline — Tailwind cannot see an interpolated
// arbitrary-value class like `text-[${size}px]`.
export default function Logo({ size = 32, onDark = false, className }) {
  return (
    <span className={cn("inline-flex flex-col items-start", className)}>
      <span
        className={cn(
          // Inter 600, not 700 — see the weight budget in the brand doc §6.
          "font-semibold tracking-tight leading-none",
          onDark ? "text-ink-foreground" : "text-brand-navy"
        )}
        style={{ fontSize: size }}
      >
        BX
      </span>
      <span
        aria-hidden="true"
        className="w-full self-stretch border-t-[3px] border-dashed border-brand-teal"
        style={{ marginTop: Math.max(5, Math.round(size * 0.16)) }}
      />
    </span>
  );
}
