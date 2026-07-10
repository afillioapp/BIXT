// Tiny light/dark theme switch, persisted to localStorage under "bx_theme"
// and applied by stamping document.documentElement.dataset.theme — every
// color in styles/globals.css is a var() keyed off that attribute (see the
// [data-theme="dark"] block), so nothing else needs to know this exists.
const STORAGE_KEY = "bx_theme";

export function getTheme() {
  if (typeof window === "undefined") return "light";
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "dark" ? "dark" : "light";
  } catch {
    return "light";
  }
}

export function setTheme(theme) {
  const next = theme === "dark" ? "dark" : "light";
  if (typeof document !== "undefined") {
    document.documentElement.dataset.theme = next;
  }
  if (typeof window !== "undefined") {
    try {
      window.localStorage.setItem(STORAGE_KEY, next);
    } catch {
      // localStorage unavailable (private browsing, etc.) — theme just
      // won't persist across reloads, not worth surfacing an error for.
    }
  }
}
