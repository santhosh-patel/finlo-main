import { useEffect, useState, useCallback } from "react";

const THEME_KEY = "finlo.theme.v1";

export interface ThemeSettings {
  mode: "light" | "dark" | "system";
  accent: string; // hex
  currency: string;
  currencySymbol: string;
}

const DEFAULT: ThemeSettings = { 
  mode: "dark", 
  accent: "#7DD3FC",
  currency: "INR",
  currencySymbol: "₹" 
};

export const ACCENT_PALETTE = [
  "#7DD3FC", // sky
  "#A78BFA", // violet
  "#F472B6", // pink
  "#FB7185", // rose
  "#FBBF24", // amber
  "#4ADE80", // green
  "#2DD4BF", // teal
  "#FB923C", // orange
];

function read(): ThemeSettings {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw) return { ...DEFAULT, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return DEFAULT;
}

function hexToHsl(hex: string): { h: number; s: number; l: number } {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let hh = 0, s = 0; const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: hh = (g - b) / d + (g < b ? 6 : 0); break;
      case g: hh = (b - r) / d + 2; break;
      case b: hh = (r - g) / d + 4; break;
    }
    hh /= 6;
  }
  return { h: Math.round(hh * 360), s: Math.round(s * 100), l: Math.round(l * 100) };
}

function apply(t: ThemeSettings) {
  const root = document.documentElement;
  const isDark =
    t.mode === "dark" ||
    (t.mode === "system" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  root.classList.toggle("dark", isDark);

  const { h, s, l } = hexToHsl(t.accent);
  root.style.setProperty("--accent", `${h} ${s}% ${l}%`);
  // foreground for accent: dark text on light accent, light on dark accent
  root.style.setProperty("--accent-foreground", l > 55 ? "220 18% 8%" : "0 0% 100%");
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeSettings>(read);

  useEffect(() => {
    apply(theme);
    try { localStorage.setItem(THEME_KEY, JSON.stringify(theme)); } catch { /* ignore */ }
    if (theme.mode === "system") {
      const mq = window.matchMedia("(prefers-color-scheme: dark)");
      const handler = () => apply(theme);
      mq.addEventListener("change", handler);
      return () => mq.removeEventListener("change", handler);
    }
  }, [theme]);

  const update = useCallback((patch: Partial<ThemeSettings>) => {
    setTheme((t) => ({ ...t, ...patch }));
  }, []);

  return { theme, update };
}
