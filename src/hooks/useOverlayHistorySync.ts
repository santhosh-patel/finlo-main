import { useEffect, useRef } from "react";

/**
 * Maps overlay stack depth to the browser history stack so Android system back
 * (and in-app back gestures) dismiss overlays before leaving the route.
 */
export function useOverlayHistorySync(overlayCount: number, closeTopOverlay: () => void) {
  /** Initialize from current depth so React Strict Mode remount does not duplicate pushState. */
  const countRef = useRef(overlayCount);
  const fromPopRef = useRef(false);
  const syncingBackRef = useRef(false);
  const closeRef = useRef(closeTopOverlay);
  closeRef.current = closeTopOverlay;

  useEffect(() => {
    const onPop = () => {
      if (syncingBackRef.current) return;
      fromPopRef.current = true;
      closeRef.current();
    };
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);

  useEffect(() => {
    const prev = countRef.current;
    const next = overlayCount;
    const wasPop = fromPopRef.current;
    fromPopRef.current = false;

    if (next > prev) {
      for (let i = 0; i < next - prev; i++) {
        window.history.pushState({ finloOverlay: true }, "", window.location.href);
      }
    } else if (next < prev && !wasPop) {
      syncingBackRef.current = true;
      try {
        for (let i = 0; i < prev - next; i++) {
          window.history.back();
        }
      } finally {
        syncingBackRef.current = false;
      }
    }
    countRef.current = next;
  }, [overlayCount]);
}
