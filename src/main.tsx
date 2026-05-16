import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { syncMobileChromeFromStoredTheme } from "./hooks/useTheme";
import "./index.css";
import { registerSW } from "virtual:pwa-register";

syncMobileChromeFromStoredTheme();

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);

// Clean up any previously registered SW in preview/iframe contexts if needed.
const isInIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();
const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com") ||
  window.location.hostname.includes("lovable.app");

if ("serviceWorker" in navigator) {
  if (import.meta.env.DEV || isInIframe || isPreviewHost) {
    navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
  } else {
    registerSW({
      immediate: true,
      onNeedRefresh() {
        window.dispatchEvent(new CustomEvent("finlo:pwa-need-refresh"));
      },
      onRegistered(r) {
        if (r) {
          // Check for updates every hour
          setInterval(() => {
            if (r.installing || !navigator.onLine) return;
            r.update().catch(() => {});
          }, 60 * 60 * 1000);
        }
      },
    });
  }
}
