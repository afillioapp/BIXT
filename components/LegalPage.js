import Link from "next/link";
import { ChevronLeft } from "lucide-react";

// Shared layout for the Terms and Privacy pages: readable on a phone, no
// sign-in needed (they're linked from the login screen, and Stripe and Google
// both ask for them).
export default function LegalPage({ title, updated, children }) {
  return (
    <div className="min-h-dvh bg-background font-sans text-text-primary">
      <div className="mx-auto max-w-2xl px-6 py-10">
        <Link href="/login" className="inline-flex items-center gap-1 text-sm text-text-secondary mb-6">
          <ChevronLeft className="size-4" aria-hidden="true" /> Back
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-xs text-text-secondary mt-1 mb-8">Last updated {updated}</p>
        <div className="flex flex-col gap-6 text-sm leading-relaxed [&_h2]:text-base [&_h2]:font-semibold [&_h2]:mb-1.5 [&_ul]:list-disc [&_ul]:pl-5 [&_ul]:flex [&_ul]:flex-col [&_ul]:gap-1 [&_a]:underline">
          {children}
        </div>
      </div>
    </div>
  );
}
