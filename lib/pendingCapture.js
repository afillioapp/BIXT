// Module-level singleton that hands a File off from the bottom-nav camera
// popover (components/BottomNav.js) to pages/capture.js after a router.push
// — a File object can't be serialized into a URL/query param, and there's no
// other shared state between those two files.
let pendingFile = null;

export function setPendingCapture(file) {
  pendingFile = file || null;
}

// Returns the stashed file (or null if none) and clears it, so a later
// direct visit to /capture never accidentally replays a stale photo.
export function takePendingCapture() {
  const file = pendingFile;
  pendingFile = null;
  return file;
}
