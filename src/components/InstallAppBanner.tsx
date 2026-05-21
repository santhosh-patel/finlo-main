import { useCallback, useEffect, useState } from "react";
import { Download, Share, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

const DISMISS_KEY = "finlo.install-banner.dismissed.v1";
const EXIT_MS = 320;

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
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" &&
      (navigator as Navigator & { maxTouchPoints?: number }).maxTouchPoints! > 1)
  );
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
  const [exiting, setExiting] = useState(false);
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
    setExiting(true);
    window.setTimeout(() => {
      try {
        localStorage.setItem(DISMISS_KEY, "1");
      } catch {
        /* ignore */
      }
      setDismissed(true);
      setDeferred(null);
      setShowIosHint(false);
      setExiting(false);
    }, EXIT_MS);
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
        "overflow-hidden border-b border-border/40 bg-surface/95 backdrop-blur-md text-foreground",
        exiting
          ? "animate-out fade-out slide-out-to-top-2 duration-300 ease-in motion-reduce:animate-none"
          : "animate-in fade-in slide-in-from-top-2 duration-500 ease-out-soft motion-reduce:animate-none",
        className,
      )}
    >
      <div className="flex items-center gap-3 px-4 py-3">
        <div
          className={cn(
            "flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border/50 bg-background/80",
            "transition-transform duration-300 ease-out-soft",
          )}
        >
          <Download className="h-4 w-4 text-foreground/80" aria-hidden />
        </div>

        <div className="min-w-0 flex-1">
          {deferred ? (
            <>
              <p className="text-sm font-medium leading-snug tracking-tight">Install Finlo</p>
              <p className="text-[11px] text-ink-muted mt-0.5 leading-relaxed">
                Home screen access, full-screen experience
              </p>
            </>
          ) : (
            <>
              <p className="text-sm font-medium leading-snug tracking-tight">Add to Home Screen</p>
              <p className="text-[11px] text-ink-muted mt-0.5 leading-relaxed flex items-center gap-1 flex-wrap">
                Tap
                <Share className="h-3 w-3 inline shrink-0 text-foreground/70" aria-hidden />
                <span className="font-medium text-foreground/85">Share</span>
                <span className="text-ink-muted/70">→</span>
                <span className="font-medium text-foreground/85">Add to Home Screen</span>
              </p>
            </>
          )}
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={dismiss}
            className={cn(
              "p-1.5 rounded-full text-ink-muted",
              "transition-colors duration-200 hover:text-foreground hover:bg-background/70",
              "active:scale-95",
            )}
            aria-label="Dismiss install hint"
          >
            <X className="h-4 w-4" />
          </button>
          {deferred && (
            <Button
              type="button"
              size="sm"
              className={cn(
                "rounded-full h-8 px-3.5 gap-1.5 text-xs font-semibold",
                "transition-all duration-300 ease-out-soft active:scale-[0.97]",
              )}
              onClick={install}
            >
              <Download className="h-3 w-3" aria-hidden />
              Install
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
