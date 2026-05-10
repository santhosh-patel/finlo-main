import { useCallback, useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "finlo.install-banner.dismissed.v1";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

function isStandalone(): boolean {
  if (typeof window === "undefined") return true;
  const mq = window.matchMedia("(display-mode: standalone)");
  if (mq.matches) return true;
  return Boolean((window.navigator as Navigator & { standalone?: boolean }).standalone);
}

function isIos(): boolean {
  if (typeof navigator === "undefined") return false;
  return /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints! > 1);
}

function isMobileViewport(): boolean {
  if (typeof window === "undefined") return false;
  return window.matchMedia("(max-width: 767px)").matches;
}

export function InstallAppBanner({ className }: { className?: string }) {
  const [dismissed, setDismissed] = useState(() => {
    try {
      return localStorage.getItem(DISMISS_KEY) === "1";
    } catch {
      return false;
    }
  });
  const [deferred, setDeferred] = useState<BeforeInstallPromptEvent | null>(null);
  const [showIosHint, setShowIosHint] = useState(false);
  const [mobile, setMobile] = useState(isMobileViewport);

  useEffect(() => {
    if (isStandalone() || dismissed) return;
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setMobile(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, [dismissed]);

  useEffect(() => {
    if (isStandalone() || dismissed || !mobile) return;
    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BeforeInstallPromptEvent);
      setShowIosHint(false);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, [dismissed, mobile]);

  useEffect(() => {
    if (isStandalone() || dismissed || !mobile || deferred) return;
    if (isIos()) setShowIosHint(true);
    else setShowIosHint(false);
  }, [dismissed, mobile, deferred]);

  const dismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_KEY, "1");
    } catch { /* ignore */ }
    setDismissed(true);
    setDeferred(null);
    setShowIosHint(false);
  }, []);

  const install = useCallback(async () => {
    if (!deferred) return;
    try {
      await deferred.prompt();
      await deferred.userChoice;
    } catch {
      /* ignore */
    }
    setDeferred(null);
  }, [deferred]);

  if (isStandalone() || dismissed || !mobile) return null;
  if (!deferred && !showIosHint) return null;

  return (
    <div
      className={cn(
        "flex items-start gap-3 px-4 py-3 border-b border-border/60 bg-surface/95 backdrop-blur-md text-foreground",
        className,
      )}
    >
      <div className="min-w-0 flex-1 pt-0.5">
        {deferred ? (
          <>
            <p className="text-sm font-medium leading-snug">Install Finlo</p>
            <p className="text-[11px] text-ink-muted mt-1 leading-relaxed">
              Add to your home screen for a full-screen app experience and quicker access.
            </p>
          </>
        ) : (
          <>
            <p className="text-sm font-medium leading-snug">Add Finlo to Home Screen</p>
            <p className="text-[11px] text-ink-muted mt-1 leading-relaxed flex items-center gap-1 flex-wrap">
              Tap
              <Share className="h-3.5 w-3.5 inline shrink-0 text-foreground/80" aria-hidden />
              <span className="font-medium text-foreground/90">Share</span>
              then
              <span className="font-medium text-foreground/90">Add to Home Screen</span>.
            </p>
          </>
        )}
      </div>
      <div className="flex flex-col items-end gap-1.5 shrink-0">
        <button
          type="button"
          onClick={dismiss}
          className="p-1 rounded-full text-ink-muted hover:text-foreground hover:bg-background/80"
          aria-label="Dismiss install hint"
        >
          <X className="h-4 w-4" />
        </button>
        {deferred && (
          <Button type="button" size="sm" className="rounded-full h-9 px-4 gap-1.5" onClick={install}>
            <Download className="h-3.5 w-3.5" aria-hidden />
            Install
          </Button>
        )}
      </div>
    </div>
  );
}
