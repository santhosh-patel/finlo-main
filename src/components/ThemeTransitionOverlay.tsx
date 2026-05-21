import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

/**
 * Brief gradient flare during View Transition theme switches (skipped when reduced motion).
 */
export function ThemeTransitionOverlay() {
  const [active, setActive] = useState(false);
  const [target, setTarget] = useState<string | null>(null);

  useEffect(() => {
    const onStart = () => {
      setTarget(document.documentElement.dataset.themeTransitionTarget ?? null);
      setActive(true);
    };
    const onEnd = () => {
      setActive(false);
      setTarget(null);
    };

    document.addEventListener("finlo:theme-transition-start", onStart);
    document.addEventListener("finlo:theme-transition-end", onEnd);
    return () => {
      document.removeEventListener("finlo:theme-transition-start", onStart);
      document.removeEventListener("finlo:theme-transition-end", onEnd);
    };
  }, []);

  if (!active) return null;

  const isWarm =
    target === "sunrise" ||
    target === "light" ||
    (target === "system" &&
      !window.matchMedia("(prefers-color-scheme: dark)").matches);

  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-0 z-[250]",
        "animate-in fade-in duration-300 motion-reduce:animate-none",
      )}
      aria-hidden
    >
      <div
        className={cn(
          "absolute inset-0 opacity-0 animate-in fade-in duration-[1200ms] ease-out-soft motion-reduce:animate-none",
          isWarm
            ? "bg-gradient-to-br from-amber-200/25 via-rose-200/15 to-orange-100/10"
            : "bg-gradient-to-br from-indigo-500/20 via-violet-600/15 to-purple-900/10",
        )}
        style={{
          animation: "finlo-theme-overlay-fade 1.2s cubic-bezier(0.22, 1, 0.36, 1) forwards",
        }}
      />
    </div>
  );
}
