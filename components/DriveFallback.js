// Shared "Drive isn't ready" card for every authenticated tab, so no page
// can dead-end on a bare "Loading…" again. Exactly one of three states:
// connect (no token), retry (token but Drive unreachable), or still loading.
// Restyled per design_handoff_bxt_app's "Connect Google Drive card" and
// "Retry / connection-error card" shared components.
export default function DriveFallback({ needsConnect, loadError, onConnect, onRetry }) {
  if (needsConnect) {
    return (
      <div className="drive-fallback">
        <div className="drive-fallback-icon" aria-hidden="true">
          <svg width="28" height="28" viewBox="0 0 28 28">
            <path
              d="M10 3h8l7 12-4 7H7l-4-7z"
              fill="none"
              stroke="var(--on-dark)"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
          </svg>
        </div>
        <div className="drive-fallback-title">Connect your Google Drive</div>
        <div className="drive-fallback-copy">
          BXT saves every receipt straight into a folder in your own Drive — you always own the
          files.
        </div>
        <button className="btn btn-primary" onClick={onConnect}>Connect Google Drive</button>
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="drive-fallback">
        <div className="status status-error">
          We couldn't reach Google Drive. Check your internet connection and try again.
        </div>
        <button className="btn btn-secondary" onClick={onRetry}>Retry</button>
      </div>
    );
  }
  return (
    <div className="drive-fallback">
      <div className="status status-info">Loading…</div>
    </div>
  );
}
