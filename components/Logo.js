import { cn } from "../lib/cn";

// Wordmark logo — markup/classes ported verbatim from lovable-design's
// BXLogo.tsx (bold "BX" + a rounded teal underline bar spanning the full
// width of the letters), kept API-compatible with this app's existing call
// sites (pages/login.js, components/SplashLoader.js, components/
// BiometricGate.js all pass a raw pixel `size`, not BXLogo's sm/md/lg/xl
// enum) — so the enum is dropped in favor of the numeric size this app
// already uses everywhere, and the arbitrary pixel sizing is done via
// inline style (Tailwind's static class scanner can't see interpolated
// arbitrary-value classes like `text-[${size}px]`). `onDark` mirrors
// BXLogo's `variant` prop (light text for navy/dark surfaces); `animated`
// keeps the splash-loader's line-extend loop, whose keyframes still live in
// styles/globals.css (logo-line-anim / logo-line-extend).
export default function Logo({ size = 32, animated = false, onDark = false, className }) {
  const underlineHeight = Math.max(4, Math.round(size * 0.15));

  return (
    <span className={cn("inline-flex flex-col items-start", className)}>
      <span
        className={cn(
          "font-bold tracking-tight leading-none",
          onDark ? "text-white" : "text-brand-navy",
        )}
        style={{ fontSize: size }}
      >
        BX
      </span>
      <span
        aria-hidden="true"
        className={cn("mt-1 w-full self-stretch rounded-full bg-brand-teal", animated && "logo-line-anim")}
        style={{ height: underlineHeight }}
      />
    </span>
  );
}
