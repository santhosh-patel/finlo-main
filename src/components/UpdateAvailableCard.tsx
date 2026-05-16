import { usePWAUpdate } from "@/hooks/usePWAUpdate";
import { Button } from "@/components/ui/button";
import { Download, RefreshCcw } from "lucide-react";
import { cn } from "@/lib/utils";

interface UpdateAvailableCardProps {
  className?: string;
  variant?: "card" | "banner";
}

export function UpdateAvailableCard({ className }: UpdateAvailableCardProps) {
  const { updateAvailable, updateApp } = usePWAUpdate();

  if (!updateAvailable) return null;

  return (
    <div className={cn("p-1.5 pr-5 rounded-full bg-surface/80 backdrop-blur-md border border-border/50 flex items-center justify-between gap-3 animate-in fade-in slide-in-from-top-2", className)}>
      <div className="flex items-center gap-3">
        <div className="h-8 w-8 rounded-full bg-foreground text-background flex items-center justify-center shrink-0">
          <RefreshCcw className="h-3.5 w-3.5" />
        </div>
        <p className="text-sm font-medium text-foreground tracking-tight">Finlo update ready</p>
      </div>
      <button 
        onClick={updateApp} 
        className="text-[10px] font-bold uppercase tracking-widest text-ink-muted hover:text-foreground transition-colors outline-none"
      >
        Restart
      </button>
    </div>
  );
}
