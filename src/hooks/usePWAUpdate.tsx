import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";

export type UpdateCheckResult =
  | "unsupported"
  | "dev"
  | "up-to-date"
  | "update-applied";

type PWAUpdateContextValue = {
  updateAvailable: boolean;
  updateApp: () => Promise<void>;
  checkForUpdate: () => Promise<UpdateCheckResult>;
  checking: boolean;
  isUpdating: boolean;
};

const PWAUpdateContext = createContext<PWAUpdateContextValue | null>(null);

function isDevOrPreview() {
  if (import.meta.env.DEV) return true;
  const host = window.location.hostname;
  return (
    host.includes("id-preview--") ||
    host.includes("lovableproject.com") ||
    host.includes("lovable.app")
  );
}

async function activateWaitingWorker(registration: ServiceWorkerRegistration) {
  const waiting = registration.waiting;
  if (!waiting) return false;

  await new Promise<void>((resolve) => {
    const onControllerChange = () => {
      navigator.serviceWorker.removeEventListener("controllerchange", onControllerChange);
      resolve();
    };
    navigator.serviceWorker.addEventListener("controllerchange", onControllerChange);
    waiting.postMessage({ type: "SKIP_WAITING" });
  });
  return true;
}

function waitForInstallingWorker(
  registration: ServiceWorkerRegistration,
  timeoutMs: number,
): Promise<boolean> {
  return new Promise((resolve) => {
    const done = (found: boolean) => {
      clearTimeout(timer);
      resolve(found);
    };

    const timer = setTimeout(() => done(false), timeoutMs);

    const tryActivate = () => {
      if (registration.waiting) {
        done(true);
        return true;
      }
      return false;
    };

    if (tryActivate()) return;

    const installing = registration.installing;
    if (installing) {
      installing.addEventListener("statechange", () => {
        if (installing.state === "installed") tryActivate();
      });
      return;
    }

    registration.addEventListener("updatefound", () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener("statechange", () => {
        if (worker.state === "installed") tryActivate();
      });
    });
  });
}

const UPDATE_UI_MIN_MS = 520;

function delay(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

export function PWAUpdateProvider({ children }: { children: ReactNode }) {
  const [updateAvailable, setUpdateAvailable] = useState(false);
  const [checking, setChecking] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;

    const handleControllerChange = () => {
      setUpdateAvailable(true);
    };

    const handleNeedRefresh = () => {
      setUpdateAvailable(true);
    };

    navigator.serviceWorker.addEventListener("controllerchange", handleControllerChange);
    window.addEventListener("finlo:pwa-need-refresh", handleNeedRefresh);

    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        void navigator.serviceWorker.ready.then((r) => r.update().catch(() => {}));
      }
    };

    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      navigator.serviceWorker.removeEventListener("controllerchange", handleControllerChange);
      window.removeEventListener("finlo:pwa-need-refresh", handleNeedRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, []);

  const updateApp = useCallback(async () => {
    if (isUpdating) return;
    setIsUpdating(true);
    const started = Date.now();

    const finishReload = async () => {
      const elapsed = Date.now() - started;
      if (elapsed < UPDATE_UI_MIN_MS) await delay(UPDATE_UI_MIN_MS - elapsed);
      window.location.reload();
    };

    if (!("serviceWorker" in navigator)) {
      await finishReload();
      return;
    }

    try {
      const cacheKeys = await caches.keys();
      const assetsCaches = cacheKeys.filter(
        (key) => key.includes("assets") || key.includes("html") || key.includes("workbox"),
      );
      await Promise.all(assetsCaches.map((key) => caches.delete(key)));

      const registration = await navigator.serviceWorker.ready;
      if (registration.waiting) {
        await activateWaitingWorker(registration);
      }
    } catch (err) {
      console.error("Failed to clear cache safely during update:", err);
    }

    await finishReload();
  }, [isUpdating]);

  const checkForUpdate = useCallback(async (): Promise<UpdateCheckResult> => {
    if (!("serviceWorker" in navigator)) return "unsupported";
    if (isDevOrPreview()) return "dev";

    setChecking(true);
    try {
      const registration = await navigator.serviceWorker.ready;
      await registration.update();

      if (registration.waiting) {
        setIsUpdating(true);
        const started = Date.now();
        await activateWaitingWorker(registration);
        const elapsed = Date.now() - started;
        if (elapsed < UPDATE_UI_MIN_MS) await delay(UPDATE_UI_MIN_MS - elapsed);
        window.location.reload();
        return "update-applied";
      }

      const found = await waitForInstallingWorker(registration, 12_000);
      if (found && registration.waiting) {
        setIsUpdating(true);
        const started = Date.now();
        await activateWaitingWorker(registration);
        const elapsed = Date.now() - started;
        if (elapsed < UPDATE_UI_MIN_MS) await delay(UPDATE_UI_MIN_MS - elapsed);
        window.location.reload();
        return "update-applied";
      }

      return "up-to-date";
    } catch (err) {
      console.error("Failed to check for PWA update:", err);
      throw err;
    } finally {
      setChecking(false);
    }
  }, []);

  const value: PWAUpdateContextValue = {
    updateAvailable,
    updateApp,
    checkForUpdate,
    checking,
    isUpdating,
  };

  return <PWAUpdateContext.Provider value={value}>{children}</PWAUpdateContext.Provider>;
}

export function usePWAUpdate() {
  const ctx = useContext(PWAUpdateContext);
  if (!ctx) {
    throw new Error("usePWAUpdate must be used within PWAUpdateProvider");
  }
  return ctx;
}
