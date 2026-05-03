import { Expense, dayLabel, formatINR, rangeDays, weekRangeOf } from "@/lib/expenses";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { ExpenseRow } from "@/components/ExpenseRow";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

interface Props {
  expenses: Expense[];
  anchor: string;
  onSelect?: (e: Expense) => void;
}

export function WeeklyView({ expenses, anchor, onSelect }: Props) {
  const { from, to, label } = useMemo(() => weekRangeOf(anchor), [anchor]);
  const days = useMemo(() => rangeDays(from, to), [from, to]);
  const [openDay, setOpenDay] = useState<string | null>(null);

  const byDay = useMemo(() => {
    const map = new Map<string, Expense[]>();
    days.forEach((d) => map.set(d, []));
    expenses.forEach((e) => {
      if (e.date >= from && e.date <= to) {
        const list = map.get(e.date) || [];
        list.push(e);
        map.set(e.date, list);
      }
    });
    return map;
  }, [expenses, days, from, to]);

  const totals = days.map((d) => ({
    date: d,
    total: (byDay.get(d) || []).reduce((a, b) => a + b.amount, 0),
  }));
  const max = Math.max(...totals.map((t) => t.total), 1);
  const weekTotal = totals.reduce((a, b) => a + b.total, 0);
  const peak = totals.reduce((a, b) => (b.total > a.total ? b : a), totals[0]);

  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between mb-6">
        <h3 className="text-[10px] tracking-[0.2em] uppercase font-medium text-ink-muted">
          {label}
        </h3>
        <span className="font-serif text-xl text-foreground tabular-nums">
          ₹{formatINR(weekTotal)}
        </span>
      </div>

      <div className="flex items-end justify-between gap-2 h-40 px-1 mb-8">
        {totals.map((t) => {
          const h = (t.total / max) * 100;
          const isPeak = t.total > 0 && t.date === peak.date;
          return (
            <button
              type="button"
              key={t.date}
              onClick={() => setOpenDay(openDay === t.date ? null : t.date)}
              className="flex-1 flex flex-col items-center gap-2 group"
            >
              <span className="text-[10px] tabular-nums text-ink-muted">
                {t.total > 0 ? Math.round(t.total) : ""}
              </span>
              <div className="w-full flex-1 flex items-end">
                <div
                  className={cn(
                    "w-full rounded-t-md transition-all group-hover:opacity-80",
                    isPeak ? "bg-foreground" : "bg-wash-sage",
                    openDay === t.date && "ring-2 ring-foreground/40"
                  )}
                  style={{ height: `${Math.max(h, t.total > 0 ? 6 : 2)}%` }}
                />
              </div>
              <span
                className={cn(
                  "text-[10px] tracking-wider uppercase",
                  isPeak ? "text-foreground font-medium" : "text-ink-muted"
                )}
              >
                {dayLabel(t.date)}
              </span>
            </button>
          );
        })}
      </div>

      <div className="space-y-2">
        {days.map((d) => {
          const items = byDay.get(d) || [];
          if (items.length === 0) return null;
          const dayTotal = items.reduce((a, b) => a + b.amount, 0);
          const isOpen = openDay === d;
          return (
            <Collapsible
              key={d}
              open={isOpen}
              onOpenChange={(v) => setOpenDay(v ? d : null)}
            >
              <CollapsibleTrigger className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-surface/50 hover:bg-surface transition-colors text-left">
                <span className="flex items-center gap-2 text-sm text-foreground">
                  <ChevronDown
                    className={cn(
                      "h-3.5 w-3.5 text-ink-muted transition-transform",
                      isOpen && "rotate-180"
                    )}
                  />
                  {new Date(d + "T00:00:00").toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "short",
                    day: "numeric",
                  })}
                  <span className="text-ink-muted text-xs">({items.length})</span>
                </span>
                <span className="font-serif text-base text-foreground tabular-nums">
                  ₹{formatINR(dayTotal)}
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="flex flex-col divide-y divide-border/50 pl-2 pt-1">
                  {items.map((e) => (
                    <ExpenseRow key={e.id} expense={e} onSelect={onSelect} />
                  ))}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
        {weekTotal === 0 && (
          <p className="text-center text-ink-muted text-sm py-6">
            No expenses logged for this week.
          </p>
        )}
      </div>
    </section>
  );
}