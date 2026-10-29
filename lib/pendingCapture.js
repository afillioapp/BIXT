// Module-level singleton that hands Files off from the bottom-nav camera
// popover (components/BottomNav.js) to pages/capture.js after a router.push
// — a File object can't be serialized into a URL/query param, and there's no
// other shared state between those two files. Holds a list, since "Choose
// photos" can pick several receipts at once (batch capture, 2026-10-29).
let pendingFiles = [];

export function setPendingCapture(files) {
  pendingFiles = Array.from(files || []).filter(Boolean);
}

// Returns the stashed files (possibly empty) and clears them, so a later
// direct visit to /capture never accidentally replays stale photos.
export function takePendingCapture() {
  const files = pendingFiles;
  pendingFiles = [];
  return files;
}
