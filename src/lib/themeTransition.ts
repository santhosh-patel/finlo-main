export type ThemeAppearance =
  | "light"
  | "dark"
  | "sunrise"
  | "sunset"
  | "system";

export type ThemeTransitionOrigin = { x: number; y: number };

const EASE_THEME = "cubic-bezier(0.22, 1, 0.36, 1)";
const DURATION_MS = 1200;

function prefersReducedMotion(): boolean {
  return (
    typeof window !== "undefined" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );
}

export function supportsThemeViewTransition(): boolean {
  return typeof document !== "undefined" && "startViewTransition" in document;
}

export function setThemeTransitionOrigin(origin?: ThemeTransitionOrigin) {
  const root = document.documentElement;
  const x = origin?.x ?? window.innerWidth - 48;
  const y = origin?.y ?? 24;
  root.style.setProperty("--theme-tx-x", `${x}px`);
  root.style.setProperty("--theme-tx-y", `${y}px`);
}

/** Circular view-transition reveal when switching appearance. */
export async function withThemeTransition(
  applyTheme: () => void,
  options?: {
    origin?: ThemeTransitionOrigin;
    target?: ThemeAppearance;
  },
): Promise<void> {
  const target = options?.target;
  if (target) {
    document.documentElement.dataset.themeTransitionTarget = target;
  }

  if (!supportsThemeViewTransition() || prefersReducedMotion()) {
    applyTheme();
    delete document.documentElement.dataset.themeTransitionTarget;
    return;
  }

  setThemeTransitionOrigin(options?.origin);
  document.dispatchEvent(new CustomEvent("finlo:theme-transition-start"));

  try {
    const transition = document.startViewTransition(() => {
      applyTheme();
    });
    await transition.finished;
  } finally {
    delete document.documentElement.dataset.themeTransitionTarget;
    document.dispatchEvent(new CustomEvent("finlo:theme-transition-end"));
  }
}

export const THEME_TRANSITION = {
  ease: EASE_THEME,
  durationMs: DURATION_MS,
} as const;
