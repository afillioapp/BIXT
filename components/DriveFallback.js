// Shared "Drive isn't ready" card for every authenticated tab, so no page
// can dead-end on a bare "Loading…" again. Exactly one of three states:
// connect (no token), retry (token but Drive unreachable), or still loading.
export default function DriveFallback({ needsConnect, loadError, onConnect, onRetry }) {
  if (needsConnect) {
    return (
      <div className="card">
        <div style={{ marginBottom: 10, fontSize: 14 }}>Connect your Google Drive to continue</div>
        <button className="btn btn-primary" onClick={onConnect}>Connect Google Drive</button>
      </div>
    );
  }
  if (loadError) {
    return (
      <div className="card">
        <div style={{ marginBottom: 10, fontSize: 14 }}>
          We couldn't reach Google Drive. Check your internet connection and try again.
        </div>
        <button className="btn btn-primary" onClick={onRetry}>Retry</button>
      </div>
    );
  }
  return (
    <div className="card">
      <div style={{ fontSize: 14 }}>Loading…</div>
    </div>
  );
}
