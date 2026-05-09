/** Matches `src/index.css` --background for light / dark (HSL → hex for OS UI). */
const THEME_COLOR_LIGHT = "#f5f2eb";
const THEME_COLOR_DARK = "#0b0d12";

/**
 * Keeps `theme-color`, `color-scheme`, and iOS web-app status bar in sync with Finlo theme.
 * Call whenever light/dark effective mode changes.
 */
export function applyMobileChrome(isDark: boolean): void {
  document.documentElement.style.colorScheme = isDark ? "dark" : "light";

  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", isDark ? THEME_COLOR_DARK : THEME_COLOR_LIGHT);

  const apple = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (apple) {
    apple.setAttribute("content", isDark ? "black-translucent" : "default");
  }
}
