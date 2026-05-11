import { cn } from "@/lib/utils";

type PullPhase = "idle" | "pulling" | "refreshing";

const R = 9;
const STROKE = 2;
const C = 2 * Math.PI * R;

interface Props {
  phase: PullPhase;
  /** Rubber-banded pull distance in px */
  pullPx: number;
  /** Release threshold — arc reaches full “ready” hint near this pull */
  thresholdPx?: number;
  className?: string;
}

/**
 * Minimal pull-to-refresh affordance: thin ring that grows while pulling,
 * short arc with smooth spin while refreshing (no icon font).
 */
export function PullRefreshIndicator({
  phase,
  pullPx,
  thresholdPx = 72,
  className,
}: Props) {
  const refreshing = phase === "refreshing";
  const t = Math.min(1, Math.max(0, pullPx / thresholdPx));

  // Pull: arc grows from a sliver to ~78% of the ring; opacity eases in.
  const pullDash = refreshing ? 0 : C * (0.06 + t * 0.78);
  const pullRest = C - pullDash;

  // Refresh: fixed gap arc (~26% of circumference), whole SVG rotates.
  const refreshDash = `${C * 0.26} ${C}`;

  // Let the spinner move down as we pull, up to a maximum of 44px
  const translatePx = Math.min(44, pullPx);

  return (
    <div
      className={cn(
        "pointer-events-none flex justify-center pt-[calc(env(safe-area-inset-top,0px)+14px)]",
        className,
      )}
      style={{
        transform: `translateY(${translatePx}px)`,
        transition: phase !== "pulling" ? "transform 330ms cubic-bezier(0.2, 0.8, 0.2, 1)" : undefined,
      }}
      aria-hidden
    >
      <div className="flex h-[26px] w-[26px] items-center justify-center">
        <svg
          width="24"
          height="24"
          viewBox="0 0 24 24"
          className={cn(
            "block text-foreground/50 motion-reduce:text-foreground/40",
            refreshing && "motion-safe:animate-finlo-refresh-spin motion-reduce:animate-none",
            !refreshing && "transition-[opacity] duration-150",
          )}
          style={{ opacity: refreshing ? 1 : 0.35 + 0.55 * t }}
          aria-hidden
        >
          <circle
            cx="12"
            cy="12"
            r={R}
            fill="none"
            stroke="currentColor"
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={refreshing ? refreshDash : `${pullDash} ${pullRest}`}
            transform="rotate(-90 12 12)"
            className="motion-reduce:opacity-80"
          />
        </svg>
      </div>
    </div>
  );
}
