import { Target, TrendingUp, Sparkles } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { cn, vibrate } from "@/lib/utils";
import { formatINR, getCurrencySymbol } from "@/lib/expenses";

interface Props {
  title: string;
  targetAmount: number;
  currentAmount: number;
  color?: string;
  deadline?: string;
  onAddContribution?: () => void;
}

export function JointGoalCard({ title, targetAmount, currentAmount, color = "primary", deadline, onAddContribution }: Props) {
  const percentage = targetAmount > 0 ? Math.min(100, (currentAmount / targetAmount) * 100) : 0;
  
  return (
    <Card className="relative overflow-hidden rounded-[24px] border border-border/40 p-5 bg-surface/20 backdrop-blur-sm group hover:border-primary/20 transition-all duration-500">
      <div className="absolute top-0 right-0 p-4 opacity-[0.03] group-hover:opacity-[0.07] transition-opacity">
        <Target className="h-24 w-24" />
      </div>
      
      <div className="flex items-start justify-between mb-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            <span className={cn("h-2 w-2 rounded-full animate-pulse", `bg-${color}`)} />
            <h4 className="text-xs font-bold uppercase tracking-widest text-ink-muted/80">{title}</h4>
          </div>
          <p className="text-2xl font-serif text-foreground">{getCurrencySymbol()}{formatINR(currentAmount)}</p>
        </div>
        <div className="text-right">
          <p className="text-[10px] font-bold text-ink-muted/60 uppercase tracking-tighter">Goal</p>
          <p className="text-sm font-medium text-foreground/80">{getCurrencySymbol()}{formatINR(targetAmount)}</p>
        </div>
      </div>

      <div className="space-y-3">
        <div className="relative h-2 w-full bg-surface/40 rounded-full overflow-hidden">
          <div 
            className={cn("absolute inset-y-0 left-0 rounded-full transition-all duration-1000 ease-out-soft", `bg-${color}`)}
            style={{ width: `${percentage}%` }}
          />
        </div>
        
        <div className="flex justify-between items-center text-[10px] font-medium tracking-tight">
          <span className="text-primary flex items-center gap-1">
            <Sparkles className="h-3 w-3" /> {percentage.toFixed(0)}% Saved
          </span>
          {deadline && (
            <span className="text-ink-muted">Target: {deadline}</span>
          )}
        </div>
      </div>
      
      {onAddContribution && (
        <button 
          onClick={(e) => {
            e.stopPropagation();
            vibrate(30);
            onAddContribution();
          }}
          className="mt-4 w-full py-2.5 rounded-xl border border-border/10 bg-surface/40 text-[11px] font-bold uppercase tracking-wider text-ink-muted hover:bg-surface/60 hover:text-foreground transition-all"
        >
          Add to Goal
        </button>
      )}
    </Card>
  );
}
