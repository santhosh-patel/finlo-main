import { usePWAUpdate } from "@/hooks/usePWAUpdate";
import { cn } from "@/lib/utils";
import { ArrowUpCircle, Loader2 } from "lucide-react";
import { APP_VERSION_LABEL } from "@/lib/appVersion";

interface UpdateAvailableCardProps {
  className?: string;
  variant?: "card" | "banner";
}

export function UpdateAvailableCard({ className, variant = "card" }: UpdateAvailableCardProps) {
  const { updateAvailable, updateApp, isUpdating } = usePWAUpdate();

  if (!updateAvailable) return null;

  const isBanner = variant === "banner";

  return (
    <div
      className={cn(
        "group overflow-hidden transition-all duration-300 ease-out-soft motion-reduce:transition-none",
        isBanner
          ? "fixed left-4 right-4 z-[90] mx-auto max-w-md bottom-[calc(var(--finlo-mobile-tab-clearance,5.5rem)+0.75rem)]"
          : "w-full",
        "animate-in fade-in slide-in-from-bottom-2 duration-500 ease-out-soft motion-reduce:animate-none",
        className,
      )}
      role="status"
    >
      <div
        className={cn(
          "relative flex items-center gap-3 rounded-2xl border border-border/50 bg-surface/90 backdrop-blur-md",
          "shadow-sm transition-shadow duration-300 hover:shadow-md",
          isBanner ? "px-4 py-3.5" : "px-4 py-3",
        )}
      >
        <div
          className={cn(
            "relative flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-foreground text-background",
            "transition-transform duration-300 group-hover:scale-[1.02]",
          )}
        >
          <ArrowUpCircle
            className={cn(
              "h-4 w-4 transition-transform duration-500",
              !isUpdating && "motion-safe:animate-[finlo-update-nudge_2.4s_ease-in-out_infinite]",
            )}
          />
        </div>

        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium text-foreground tracking-tight leading-tight">
            Update ready
          </p>
          <p className="text-[11px] text-ink-muted mt-0.5 truncate">
            {isUpdating ? "Installing…" : `${APP_VERSION_LABEL} is available`}
          </p>
        </div>

        <button
          type="button"
          onClick={() => void updateApp()}
          disabled={isUpdating}
          className={cn(
            "shrink-0 rounded-full px-4 py-2 text-xs font-semibold tracking-wide",
            "bg-foreground text-background",
            "transition-all duration-300 ease-out-soft",
            "hover:opacity-90 active:scale-[0.97]",
            "disabled:opacity-60 disabled:pointer-events-none",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground/30 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
          )}
        >
          {isUpdating ? (
            <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden />
          ) : (
            "Update"
          )}
        </button>
      </div>
    </div>
  );
}
