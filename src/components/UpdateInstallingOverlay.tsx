import { createPortal } from "react-dom";
import { usePWAUpdate } from "@/hooks/usePWAUpdate";
import { cn } from "@/lib/utils";
import { APP_VERSION_LABEL } from "@/lib/appVersion";

export function UpdateInstallingOverlay() {
  const { isUpdating } = usePWAUpdate();

  if (!isUpdating || typeof document === "undefined") return null;

  return createPortal(
    <div
      className={cn(
        "fixed inset-0 z-[200] flex items-center justify-center p-6",
        "bg-background/80 backdrop-blur-md",
        "animate-in fade-in duration-300 ease-out-soft motion-reduce:animate-none",
      )}
      role="status"
      aria-live="polite"
      aria-busy="true"
    >
      <div
        className={cn(
          "w-full max-w-[280px] rounded-3xl border border-border/50 bg-surface/90 px-8 py-10 text-center shadow-lg",
          "animate-in zoom-in-95 fade-in duration-300 ease-out-soft motion-reduce:animate-none",
        )}
      >
        <div className="mx-auto mb-6 relative h-12 w-12">
          <img
            src="/finlo-logo.png"
            alt=""
            className="h-12 w-12 rounded-2xl object-contain"
          />
          <span
            className="absolute inset-0 rounded-2xl border border-foreground/20 border-t-foreground animate-spin motion-reduce:animate-none"
            aria-hidden
          />
        </div>
        <p className="font-serif text-lg text-foreground tracking-tight">Updating Finlo</p>
        <p className="text-[11px] text-ink-muted mt-2 leading-relaxed">
          Applying {APP_VERSION_LABEL} — just a moment
        </p>
        <div className="mt-6 flex items-center justify-center gap-1.5" aria-hidden>
          <span className="h-1 w-1 rounded-full bg-foreground/35 animate-bounce [animation-delay:-0.24s]" />
          <span className="h-1 w-1 rounded-full bg-foreground/35 animate-bounce [animation-delay:-0.12s]" />
          <span className="h-1 w-1 rounded-full bg-foreground/35 animate-bounce" />
        </div>
      </div>
    </div>,
    document.body,
  );
}
