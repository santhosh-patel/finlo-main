export type ThemeChromeKey = "light" | "dark" | "sunrise" | "sunset";

const THEME_COLORS: Record<ThemeChromeKey, string> = {
  light: "#f5f2eb",
  dark: "#0b0d12",
  sunrise: "#faf3e8",
  sunset: "#0c0a14",
};

/**
 * Keeps `theme-color`, `color-scheme`, and iOS web-app status bar in sync with Finlo theme.
 */
export function applyMobileChrome(key: ThemeChromeKey): void {
  const isDark = key === "dark" || key === "sunset";
  document.documentElement.style.colorScheme = isDark ? "dark" : "light";

  let meta = document.querySelector('meta[name="theme-color"]');
  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute("name", "theme-color");
    document.head.appendChild(meta);
  }
  meta.setAttribute("content", THEME_COLORS[key]);

  const apple = document.querySelector('meta[name="apple-mobile-web-app-status-bar-style"]');
  if (apple) {
    apple.setAttribute("content", isDark ? "black-translucent" : "default");
  }
}

/** @deprecated Use applyMobileChrome with ThemeChromeKey */
export function applyMobileChromeLegacy(isDark: boolean): void {
  applyMobileChrome(isDark ? "dark" : "light");
}
