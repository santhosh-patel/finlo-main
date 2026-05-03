import { useEffect, useState, useCallback } from "react";

const THEME_KEY = "ledger.theme.v1";

export interface ThemeSettings {
  mode: "light" | "dark";
  accent: string; // hex
}

const DEFAULT: ThemeSettings = { mode: "light", accent: "#D1D8CA" };

function read(): ThemeSettings {
  try {
    const raw = localStorage.getItem(THEME_KEY);
    if (raw) return { ...DEFAULT, ...JSON.parse(raw) };
  } catch { /* ignore */ }
  return DEFAULT;
}

function hexToHslVar(hex: string): string {
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
  return `${Math.round(hh * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function apply(t: ThemeSettings) {
  const root = document.documentElement;
  if (t.mode === "dark") root.classList.add("dark");
  else root.classList.remove("dark");
  root.style.setProperty("--accent", hexToHslVar(t.accent));
  root.style.setProperty("--wash-sage", hexToHslVar(t.accent));
}

export function useTheme() {
  const [theme, setTheme] = useState<ThemeSettings>(read);

  useEffect(() => {
    apply(theme);
    try { localStorage.setItem(THEME_KEY, JSON.stringify(theme)); } catch { /* ignore */ }
  }, [theme]);

  const update = useCallback((patch: Partial<ThemeSettings>) => {
    setTheme((t) => ({ ...t, ...patch }));
  }, []);

  return { theme, update };
}