import { useCallback, useEffect, useRef, useState } from "react";

const THRESHOLD_PX = 72;
const MAX_PULL_PX = 112;
const RUBBER = 0.45;

type Phase = "idle" | "pulling" | "refreshing";

/**
 * Pull down from the top of the page (when scrollY is 0) to refresh.
 * Intended for narrow / touch layouts; gate with `enabled`.
 */
export function usePullToRefresh(enabled: boolean, onRefresh: () => Promise<void>) {
  const [phase, setPhase] = useState<Phase>("idle");
  const [pullPx, setPullPx] = useState(0);
  const startY = useRef(0);
  const pulling = useRef(false);
  const pullDistanceRef = useRef(0);
  const refreshLock = useRef(false);
  const onRefreshRef = useRef(onRefresh);
  onRefreshRef.current = onRefresh;

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

    const atTop = () => window.scrollY <= 1;

    const onTouchStart = (e: TouchEvent) => {
      if (!atTop() || refreshLock.current) return;
      startY.current = e.touches[0].clientY;
      pulling.current = atTop();
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!pulling.current || refreshLock.current) return;
      if (!atTop()) {
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

    const onTouchEnd = () => {
      if (!pulling.current || refreshLock.current) {
        pulling.current = false;
        pullDistanceRef.current = 0;
        setPullPx(0);
        setPhase("idle");
        return;
      }
      pulling.current = false;
      const d = pullDistanceRef.current;
      pullDistanceRef.current = 0;
      setPullPx(0);
      if (d >= THRESHOLD_PX) void runRefresh();
      else setPhase("idle");
    };

    const onTouchCancel = () => {
      pulling.current = false;
      pullDistanceRef.current = 0;
      setPullPx(0);
      setPhase("idle");
    };

    document.addEventListener("touchstart", onTouchStart, { passive: true });
    document.addEventListener("touchmove", onTouchMove, { passive: false });
    document.addEventListener("touchend", onTouchEnd);
    document.addEventListener("touchcancel", onTouchCancel);

    return () => {
      document.removeEventListener("touchstart", onTouchStart);
      document.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("touchend", onTouchEnd);
      document.removeEventListener("touchcancel", onTouchCancel);
    };
  }, [enabled, runRefresh]);

  return { phase, pullPx, runRefresh };
}
