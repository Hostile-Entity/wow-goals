import { AppSettings } from "../types";

/** IndexedDB remains authoritative; this cache is only for the next first paint. */
export function applyTheme(theme: AppSettings["theme"]) {
  document.documentElement.dataset.theme = theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute(
    "content",
    theme === "wow" ? "#05070b" : "#f5f7f6",
  );
  try {
    localStorage.setItem("wowgoals-theme", theme);
  } catch {
    /* Theme switching still works without localStorage. */
  }
}
