import { useState, useEffect, useCallback } from 'react';

export function usePWAUpdate() {
  const [updateAvailable, setUpdateAvailable] = useState(false);

  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;

    let refreshing = false;

    // With autoUpdate and skipWaiting: true, the new service worker activates immediately.
    // The controllerchange event is our signal that the app is now controlled by a new version.
    const handleControllerChange = () => {
      if (refreshing) return;
      setUpdateAvailable(true);
    };

    navigator.serviceWorker.addEventListener('controllerchange', handleControllerChange);

    // Periodically check for updates when the app becomes visible
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        checkForUpdate();
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityChange);

    return () => {
      navigator.serviceWorker.removeEventListener('controllerchange', handleControllerChange);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, []);

  const checkForUpdate = useCallback(async () => {
    if ('serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.ready;
        await registration.update();
      } catch (err) {
        console.error('Failed to check for PWA update:', err);
      }
    }
  }, []);

  const updateApp = useCallback(async () => {
    if (!('serviceWorker' in navigator)) {
      window.location.reload();
      return;
    }

    try {
      // Clear outdated cache safely
      // We target the html and assets caches managed by workbox to ensure we don't serve stale JS/CSS
      // We avoid touching other local storage or IndexedDB (where user data is)
      const cacheKeys = await caches.keys();
      const assetsCaches = cacheKeys.filter(
        (key) => key.includes('assets') || key.includes('html') || key.includes('workbox')
      );
      await Promise.all(assetsCaches.map((key) => caches.delete(key)));

      // Skip old service worker (even though skipWaiting: true is in config, this is a safe fallback)
      const registrations = await navigator.serviceWorker.getRegistrations();
      for (const registration of registrations) {
        if (registration.waiting) {
          registration.waiting.postMessage({ type: 'SKIP_WAITING' });
        }
      }
    } catch (err) {
      console.error('Failed to clear cache safely during update:', err);
    }

    // Reload app automatically
    window.location.reload();
  }, []);

  return { updateAvailable, updateApp, checkForUpdate };
}
