import { createRoot } from "react-dom/client";
import App from "./App.tsx";
import { ErrorBoundary } from "./components/ErrorBoundary.tsx";
import { syncMobileChromeFromStoredTheme } from "./hooks/useTheme";
import "./index.css";

syncMobileChromeFromStoredTheme();

createRoot(document.getElementById("root")!).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>,
);

// PWA: register only in production and never inside Lovable preview/iframe.
const isInIframe = (() => {
  try { return window.self !== window.top; } catch { return true; }
})();
const isPreviewHost =
  window.location.hostname.includes("id-preview--") ||
  window.location.hostname.includes("lovableproject.com") ||
  window.location.hostname.includes("lovable.app");

if (import.meta.env.PROD && !isInIframe && !isPreviewHost && "serviceWorker" in navigator) {
  import("workbox-window").then(({ Workbox }) => {
    const wb = new Workbox("/sw.js");
    wb.addEventListener("waiting", () => wb.messageSkipWaiting());
    wb.register().catch(() => { /* ignore */ });
  });
} else if ("serviceWorker" in navigator && (isInIframe || isPreviewHost)) {
  // Clean up any previously registered SW in preview/iframe contexts.
  navigator.serviceWorker.getRegistrations().then((regs) => regs.forEach((r) => r.unregister()));
}
