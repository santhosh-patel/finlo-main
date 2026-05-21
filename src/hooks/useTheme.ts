import { useEffect, useState, useCallback } from "react";
import { applyMobileChrome, type ThemeChromeKey } from "@/lib/mobileChrome";
import {
  withThemeTransition,
  type ThemeTransitionOrigin,
  type ThemeAppearance,
} from "@/lib/themeTransition";

export type { ThemeAppearance };

const THEME_KEY = "finlo.theme.v1";

export interface ThemeSettings {
  mode: ThemeAppearance;
  accent: string;
  currency: string;
  currencySymbol: string;
}

const DEFAULT: ThemeSettings = {
  mode: "dark",
  accent: "#7DD3FC",
  currency: "INR",
  currencySymbol: "₹",
};

export const ACCENT_PALETTE = [
  "#7DD3FC",
  "#A78BFA",
  "#F472B6",
  "#FB7185",
  "#FBBF24",
  "#4ADE80",
  "#2DD4BF",
  "#FB923C",
];

export const THEME_APPEARANCES: {
  id: ThemeAppearance;
  label: string;
  description: string;
}[] = [
  { id: "light", label: "Light", description: "Warm paper" },
  { id: "dark", label: "Dark", description: "Charcoal" },
  { id: "sunrise", label: "Sunrise", description: "Amber glow" },
  { id: "sunset", label: "Sunset", description: "Blue dusk" },
  { id: "system", label: "System", description: "Auto" },
];

function normalizeMode(raw: unknown): ThemeAppearance {
  const m = String(raw ?? "");
  if (m === "light" || m === "dark" || m === "sunrise" || m === "sunset" || m === "system") {
    return m;
  }
  return DEFAULT.mode;
}

function read(): ThemeSettings {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<ThemeSettings>;
      return {
        ...DEFAULT,
        ...parsed,
        mode: normalizeMode(parsed.mode),
      };
    }
  } catch {
    /* ignore */
  }
  return DEFAULT;
}

export function resolveThemeState(mode: ThemeAppearance): {
  isDark: boolean;
  palette: "default" | "sunrise" | "sunset";
  chrome: ThemeChromeKey;
} {
  if (mode === "sunrise") {
    return { isDark: false, palette: "sunrise", chrome: "sunrise" };
  }
  if (mode === "sunset") {
    return { isDark: true, palette: "sunset", chrome: "sunset" };
  }
  if (mode === "system") {
    const prefersDark =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches;
    return {
      isDark: prefersDark,
      palette: "default",
      chrome: prefersDark ? "dark" : "light",
    };
  }
  if (mode === "dark") {
    return { isDark: true, palette: "default", chrome: "dark" };
  }
  return { isDark: false, palette: "default", chrome: "light" };
}

/** Run once at startup (before React) so `theme-color` matches stored theme immediately. */
export function syncMobileChromeFromStoredTheme(): void {
  if (typeof document === "undefined") return;
  const { chrome } = resolveThemeState(read().mode);
  applyMobileChrome(chrome);
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  let hh = 0;
  let s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        hh = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        hh = (b - r) / d + 2;
        break;
      case b:
        hh = (r - g) / d + 4;
        break;
    }
    hh /= 6;
  }
  return { h: Math.round(hh * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function applyDom(t: ThemeSettings) {
  const root = document.documentElement;
  const { isDark, palette, chrome } = resolveThemeState(t.mode);

  root.classList.remove("theme-sunrise", "theme-sunset");
  if (palette === "sunrise") root.classList.add("theme-sunrise");
  if (palette === "sunset") root.classList.add("theme-sunset");

  root.classList.toggle("dark", isDark);
  root.dataset.finloTheme = palette === "default" ? (isDark ? "dark" : "light") : palette;

  applyMobileChrome(chrome);

  const { h, s, l } = hexToHsl(t.accent);
  root.style.setProperty("--accent", `${h} ${s}% ${l}%`);
  root.style.setProperty("--accent-foreground", l > 55 ? "220 18% 8%" : "0 0% 100%");
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeSettings>(read);

  useEffect(() => {
    applyDom(theme);
    try {
      localStorage.setItem(THEME_KEY, JSON.stringify(theme));
    } catch {
      /* ignore */
    }

    if (theme.mode === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => applyDom(theme);
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [theme]);

  const resolved = resolveThemeState(theme.mode);

  const update = useCallback((patch: Partial<ThemeSettings>, origin?: ThemeTransitionOrigin) => {
    if (patch.mode !== undefined) {
      void withThemeTransition(
        () => setTheme((t) => ({ ...t, ...patch })),
        { origin, target: patch.mode },
      );
      return;
    }
    setTheme((t) => ({ ...t, ...patch }));
  }, []);

  const setAppearance = useCallback(
    (mode: ThemeAppearance, origin?: ThemeTransitionOrigin) => {
      update({ mode }, origin);
    },
    [update],
  );

  return {
    theme,
    update,
    setAppearance,
    isDark: resolved.isDark,
    palette: resolved.palette,
  };
}
