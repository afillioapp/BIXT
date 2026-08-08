import { cn } from "../lib/cn";

// The ink hero — the dark header six of the seven screens open with.
//
// It is the "ink" half of the paper/ink relationship the whole palette is
// built on, and it is the one surface allowed to feel lifted; every other
// container rests flat (brand doc §7). It stays dark in both themes, which
// is why everything inside it is coloured with --ink-foreground rather than
// the page's normal text tokens.
//
// This markup was duplicated verbatim across eight call sites before WP4.
// It lives here so the pattern has one definition — and note it must stay
// under components/, because Tailwind only scans pages/ and components/ and
// silently generates nothing for class names written anywhere else.
export default function PageHero({ children, className, contentClassName }) {
  return (
    <div
      className={cn(
        "bg-brand-navy rounded-b-3xl pt-10 pb-7 text-ink-foreground relative z-10 shadow-xl shadow-brand-navy/25",
        className
      )}
    >
      <div className={cn("mx-auto max-w-md px-5", contentClassName)}>{children}</div>
    </div>
  );
}

// Screen H1 — Inter 600, 24/28, -0.01em.
export function PageHeroTitle({ children, className }) {
  return (
    <h1 className={cn("text-2xl leading-7 tracking-[-0.01em] font-semibold", className)}>
      {children}
    </h1>
  );
}

// Body Secondary on ink — the one-line "what this screen is for" caption.
export function PageHeroSub({ children, className }) {
  return (
    <p className={cn("text-[13px] leading-[18px] text-ink-foreground/60 mt-1", className)}>
      {children}
    </p>
  );
}
