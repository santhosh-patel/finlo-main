import { useCallback, useEffect, useRef, useState } from "react";

const THRESHOLD_PX = 72;
const MAX_PULL_PX = 112;
const RUBBER = 0.45;

type Phase = "idle" | "pulling" | "refreshing";

function windowScrollTop(): number {
  if (typeof window === "undefined") return 0;
  return Math.max(
    window.scrollY ?? 0,
    document.documentElement.scrollTop ?? 0,
    document.body.scrollTop ?? 0,
  );
}

/**
 * Pull down from the top of the page (when scrollY is 0) to refresh.
 *
 * Scoped to a container ref so touches inside sheets / drawers / overlays
 * are ignored. Pass the ref of the outermost scrollable home-page element.
 */
export function usePullToRefresh(
  enabled: boolean,
  onRefresh: () => Promise<void>,
  containerRef?: React.RefObject<HTMLElement | null>,
) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [pullPx, setPullPx] = useState(0);
  const startY = useRef(0);
  const pulling = useRef(false);
  const pullDistanceRef = useRef(0);
  const refreshLock = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;
  const touchedInContainer = useRef(false);

  const runRefresh = useCallback(async () => {
    if (refreshLock.current) return;
    refreshLock.current = true;
    setPhase("refreshing");
    setPullPx(0);
    pullDistanceRef.current = 0;
    try {
      await onRefreshRef.current();
    } finally {
      refreshLock.current = false;
      setPhase("idle");
    }
  }, []);

  useEffect(() => {
    if (!enabled) return;

    /** Document scrolls the window; `main` often has scrollTop 0 even when the user scrolled down. */
    const isAtTop = () => {
      if (!containerRef?.current) return windowScrollTop() <= 1;
      const el = containerRef.current;
      const usesInternalScroll = el.scrollHeight > el.clientHeight + 2;
      if (usesInternalScroll) return el.scrollTop <= 1;
      return windowScrollTop() <= 1;
    };

    const isInsideOverlay = (target: EventTarget | null) => {
      if (!target || !(target instanceof HTMLElement)) return false;
      return !!(
        target.closest("[role='dialog']") ||
        target.closest("[data-vaul-drawer]") ||
        target.closest("[data-radix-popper-content-wrapper]") ||
        target.closest(".rolling-picker-modal")
      );
    };

    const onTouchStart = (e: TouchEvent) => {
      if (refreshLock.current) return;

      if (isInsideOverlay(e.target)) {
        touchedInContainer.current = false;
        return;
      }

      if (containerRef?.current) {
        const el = e.target as Node;
        if (!containerRef.current.contains(el)) {
          touchedInContainer.current = false;
          return;
        }
      }

      if (!isAtTop()) {
        touchedInContainer.current = false;
        return;
      }

      touchedInContainer.current = true;
      startY.current = e.touches[0].clientY;
      pulling.current = true;
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!touchedInContainer.current || !pulling.current || refreshLock.current) return;
      if (!isAtTop()) {
        pulling.current = false;
        pullDistanceRef.current = 0;
        setPhase("idle");
        setPullPx(0);
        return;
      }
      const dy = e.touches[0].clientY - startY.current;
      if (dy > 0) {
        e.preventDefault();
        const dist = Math.min(dy * RUBBER, MAX_PULL_PX);
        pullDistanceRef.current = dist;
        setPullPx(dist);
        setPhase(dist > 8 ? "pulling" : "idle");
      }
    };

    const reset = () => {
      if (!touchedInContainer.current) return;
      const d = pullDistanceRef.current;
      pulling.current = false;
      touchedInContainer.current = false;
      pullDistanceRef.current = 0;
      setPullPx(0);
      if (d >= THRESHOLD_PX) void runRefresh();
      else setPhase("idle");
    };

    const onTouchCancel = () => {
      pulling.current = false;
      touchedInContainer.current = false;
      pullDistanceRef.current = 0;
      setPullPx(0);
      setPhase("idle");
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", reset);
    document.addEventListener("touchcancel", onTouchCancel);

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", reset);
      document.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [enabled, runRefresh, containerRef]);

  return { phase, pullPx, runRefresh };
}
