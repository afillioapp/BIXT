import { Cloud } from "lucide-react";

// Shared "Drive isn't ready" card for every authenticated tab, so no page
// can dead-end on a bare "Loading…" again. Exactly one of three states:
// connect (no token), retry (token but Drive unreachable), or still loading.
// Restyled with the ported Lovable design primitives (white ring-1 card,
// navy icon tile, teal pill button); the three-state gating is unchanged.
export default function DriveFallback({ needsConnect, loadError, onConnect, onRetry }) {
  if (needsConnect) {
    return (
      <div className="bg-card shadow-card ring-1 ring-hairline rounded-2xl p-6 flex flex-col items-center gap-4 text-center">
        <div className="size-14 rounded-2xl bg-brand-navy grid place-items-center" aria-hidden="true">
          <Cloud className="size-6 text-ink-foreground" />
        </div>
        <p className="text-base font-semibold">Connect your Google Drive</p>
        <p className="text-sm text-text-secondary leading-relaxed max-w-[270px]">
          BX saves every receipt straight into a folder in your own Drive — you always own the
          files.
        </p>
        <button
          type="button"
          onClick={onConnect}
          className="w-full rounded-full bg-brand-teal py-3.5 font-semibold text-brand-teal-foreground hover:opacity-90 transition"
        >
          Connect Google Drive
        </button>
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="bg-card shadow-card ring-1 ring-hairline rounded-2xl p-6 flex flex-col items-center gap-4 text-center">
        <p className="text-sm text-destructive leading-relaxed">
          We couldn't reach Google Drive. Check your internet connection and try again.
        </p>
        <button
          type="button"
          onClick={onRetry}
          className="w-full rounded-full ring-1 ring-input-border bg-card py-3.5 font-semibold text-text-primary hover:bg-hover transition"
        >
          Retry
        </button>
      </div>
    );
  }
  return (
    <div className="flex flex-col items-center py-10">
      <p className="text-xs text-text-secondary">Loading…</p>
    </div>
  );
}
