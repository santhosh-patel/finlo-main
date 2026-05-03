import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  label: string;
  onPrev: () => void;
  onNext: () => void;
  canNext: boolean;
}

export function PeriodNav({ label, onPrev, onNext, canNext }: Props) {
  return (
    <div className="flex items-center justify-center gap-2 mb-8">
      <button
        type="button"
        onClick={onPrev}
        aria-label="Previous period"
        className="p-2 rounded-full text-ink-muted hover:text-foreground hover:bg-surface transition-colors"
      >
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="text-xs tracking-[0.2em] uppercase text-ink-muted font-medium min-w-[180px] text-center">
        {label}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={!canNext}
        aria-label="Next period"
        className={cn(
          "p-2 rounded-full transition-colors",
          canNext
            ? "text-ink-muted hover:text-foreground hover:bg-surface"
            : "text-ink-muted/30 cursor-not-allowed"
        )}
      >
        <ChevronRight className="h-4 w-4" />
      </button>
    </div>
  );
}