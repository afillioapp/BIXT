// Turns a thrown error into something a small-business owner can act on.
//
// lib/google.js throws developer-facing diagnostics — things like
// `Google API error (401): {"error":{"code":401,"message":"Request had
// invalid authentication credentials...` and `Upload failed (500): <html>…`.
// Every page-level catch block used to pass err.message straight to the
// screen, so a user mid-tax-season could be shown a JSON fragment or a
// rendered HTML error page as the reason their receipt didn't save. That is
// the opposite of calm, and it is the single biggest jargon leak in the app.
//
// This maps at the point of *display* only. lib/google.js is untouched, and
// in particular the "(401)" substring it throws is still intact for
// capture.js to match on when it decides to silently refresh the token and
// retry — that check reads the raw error, never this.
export function friendlyError(err, fallback = "Something didn't save. Try again — nothing was lost.") {
  const raw = typeof err === "string" ? err : err?.message || "";

  // Only reached when the automatic refresh-and-retry has already failed.
  if (raw.includes("(401)") || raw.includes("invalid authentication")) {
    return "Your Google Drive connection needs a refresh. Try again in a moment.";
  }

  // Drive unreachable: 5xx, upload failure, or the browser never got there.
  // Same sentence DriveFallback already uses — one error voice, not a new
  // one per screen.
  if (
    /Upload failed|Google API error|Failed to fetch|NetworkError|\(5\d\d\)/i.test(raw)
  ) {
    return "Couldn't reach Google Drive. Check your connection and try again.";
  }

  return fallback;
}

export default friendlyError;
