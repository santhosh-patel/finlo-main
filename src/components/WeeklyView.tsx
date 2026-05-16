import { getCurrencySymbol,  Expense, dayLabel, formatINR, rangeDays, weekRangeOf, baseAmountOf } from "@/lib/expenses";
import type { CategoryDef } from "@/lib/expenses";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { ExpenseRow } from "@/components/ExpenseRow";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";
import { getColorForCategory } from "@/lib/categoryIcons";

interface Props {
  expenses: Expense[];
  categories: CategoryDef[];
  anchor: string;
  onSelect?: (e: Expense) => void;
  anomalyExpenseIds?: Set<string>;
  currentUserId?: string | null;
  onToggleReaction?: (id: string, emoji: string) => void;
  memberAttribution?: (expense: Expense) => { addedByName?: string; addedByInitials?: string };
}

export function WeeklyView({ expenses, categories, anchor, onSelect, anomalyExpenseIds, currentUserId, onToggleReaction, memberAttribution }: Props) {
  const { from, to, label } = useMemo(() => weekRangeOf(anchor), [anchor]);
  const days = useMemo(() => rangeDays(from, to), [from, to]);
  const [openDay, setOpenDay] = useState<string | null>(null);

  const colorOf = (name: string) => {
    const cat = categories.find((c) => c.name === name);
    return getColorForCategory(name, cat?.color);
  };

  const byDay = useMemo(() => {
    const map = new Map<string, Expense[]>();
    days.forEach((d) => map.set(d, []));
    expenses.forEach((e) => {
      const dPart = e.date.split("T")[0];
      if (dPart >= from && dPart <= to) {
        const list = map.get(dPart) || [];
        list.push(e);
        map.set(dPart, list);
      }
    });
    return map;
  }, [expenses, days, from, to]);

  // Per day: { total, segments: [{ category, amount }] }
  const dayStats = days.map((d) => {
    const items = byDay.get(d) || [];
    // Only sum up expenses for segments and stats
    const itemsExp = items.filter((e) => (e.type ?? "expense") === "expense");
    const total = itemsExp.reduce((a, b) => a + baseAmountOf(b), 0);
    const m: Record<string, number> = {};
    itemsExp.forEach((e) => { m[e.category] = (m[e.category] || 0) + baseAmountOf(e); });
    const segments = Object.entries(m)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
    return { date: d, total, segments };
  });

  const maxTotal = Math.max(...dayStats.map((d) => d.total), 1);
  const weekTotal = dayStats.reduce((a, b) => a + b.total, 0);

  const weekIncome = useMemo(() => {
    return expenses
      .filter((e) => {
        const dPart = e.date.split("T")[0];
        return dPart >= from && dPart <= to && e.type === "income";
      })
      .reduce((sum, e) => sum + baseAmountOf(e), 0);
  }, [expenses, from, to]);

  const weekNet = weekIncome - weekTotal;

  // Legend: top categories of the week
  const weekTotals: Record<string, number> = {};
  dayStats.forEach((d) => d.segments.forEach((s) => {
    weekTotals[s.category] = (weekTotals[s.category] || 0) + s.amount;
  }));
  const legend = Object.entries(weekTotals)
    .sort(([, a], [, b]) => b - a)
    .slice(0, 6)
    .map(([category, amount]) => ({ category, amount }));

  return (
    <section className="mt-8">
      <div className="flex items-start justify-between mb-6">
        <h3 className="text-[10px] tracking-[0.2em] uppercase font-medium text-ink-muted mt-1">{label}</h3>
        <div className="text-right space-y-1">
          <div className="font-serif text-xl text-foreground tabular-nums flex items-baseline justify-end gap-1">
            <span className="text-xs font-sans text-ink-muted">Out:</span>
            <span>{getCurrencySymbol()}{formatINR(weekTotal)}</span>
          </div>
          {weekIncome > 0 && (
            <>
              <div className="font-serif text-sm text-emerald-600 dark:text-emerald-400 tabular-nums flex items-baseline justify-end gap-1">
                <span className="text-[10px] font-sans text-ink-muted">In:</span>
                <span>+{getCurrencySymbol()}{formatINR(weekIncome)}</span>
              </div>
              <div className={cn(
                "font-serif text-sm tabular-nums flex items-baseline justify-end gap-1 font-medium",
                weekNet >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
              )}>
                <span className="text-[10px] font-sans text-ink-muted">Net:</span>
                <span>{weekNet >= 0 ? "+" : "−"}{getCurrencySymbol()}{formatINR(Math.abs(weekNet))}</span>
              </div>
            </>
          )}
        </div>
      </div>

      {legend.length > 0 && (
        <div className="flex flex-wrap gap-x-4 gap-y-2 mb-6 px-1">
          {legend.map((l) => (
            <span key={l.category} className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: colorOf(l.category) }} />
              {l.category}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-end justify-between gap-1.5 h-64 px-1 mb-8">
        {dayStats.map((d) => {
          const heightPct = (d.total / maxTotal) * 100;
          const isOpen = openDay === d.date;
          return (
            <button
              type="button" key={d.date}
              onClick={() => setOpenDay(isOpen ? null : d.date)}
              className="flex-1 flex flex-col items-center gap-2 group h-full justify-end"
            >
              <span className="text-[10px] tabular-nums text-ink-muted mb-1 opacity-0 group-hover:opacity-100 transition-opacity">
                {d.total > 0 ? Math.round(d.total) : ""}
              </span>
              <div className="w-full flex-1 flex items-end">
                <div
                  className={cn(
                    "w-full rounded-t-lg overflow-hidden flex flex-col-reverse transition-all duration-500 ease-out group-hover:opacity-90",
                    isOpen && "ring-2 ring-foreground/20 ring-offset-1 ring-offset-background"
                  )}
                  style={{ height: `${heightPct}%`, minHeight: d.total > 0 ? 4 : 2 }}
                >
                  {d.total === 0 ? (
                    <div className="w-full h-full bg-surface/40" />
                  ) : (
                    d.segments.map((s) => (
                      <div
                        key={s.category}
                        title={`${s.category} · ${getCurrencySymbol()}${formatINR(s.amount)}`}
                        className="w-full"
                        style={{
                          height: `${(s.amount / d.total) * 100}%`,
                          backgroundColor: colorOf(s.category),
                        }}
                      />
                    ))
                  )}
                </div>
              </div>
              <span
                className={cn(
                  "text-[10px] tracking-wider uppercase mt-1",
                  isOpen ? "text-foreground font-semibold" : "text-ink-muted"
                )}
              >{dayLabel(d.date)}</span>
            </button>
          );
        })}
      </div>

      <div className="space-y-2">
        {days.map((d) => {
          const items = byDay.get(d) || [];
          if (items.length === 0) return null;
          const itemsExp = items.filter((e) => (e.type ?? "expense") === "expense");
          const itemsInc = items.filter((e) => e.type === "income");
          const dayExpensesSum = itemsExp.reduce((a, b) => a + baseAmountOf(b), 0);
          const dayIncomeSum = itemsInc.reduce((a, b) => a + baseAmountOf(b), 0);
          
          const isOpen = openDay === d;
          return (
            <Collapsible key={d} open={isOpen} onOpenChange={(v) => setOpenDay(v ? d : null)}>
              <CollapsibleTrigger className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-surface/50 hover:bg-surface transition-colors text-left">
                <span className="flex items-center gap-2 text-sm text-foreground">
                  <ChevronDown className={cn("h-3.5 w-3.5 text-ink-muted transition-transform", isOpen && "rotate-180")} />
                  {new Date(d.split("T")[0] + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                  <span className="text-ink-muted text-xs">({items.length})</span>
                </span>
                <span className="font-serif text-base text-foreground tabular-nums flex items-baseline gap-2 shrink-0">
                  {dayIncomeSum > 0 && (
                    <span className="text-xs font-sans text-emerald-600 dark:text-emerald-400">
                      +{getCurrencySymbol()}{formatINR(dayIncomeSum)}
                    </span>
                  )}
                  <span>{getCurrencySymbol()}{formatINR(dayExpensesSum)}</span>
                </span>
              </CollapsibleTrigger>
              <CollapsibleContent>
                <div className="flex flex-col divide-y divide-border/50 pl-2 pt-1">
                  {items.map((e) => {
                    const attribution = memberAttribution?.(e) ?? {};
                    return (
                      <ExpenseRow
                        key={e.id}
                        expense={e}
                        onSelect={onSelect}
                        categories={categories}
                        showAnomaly={anomalyExpenseIds?.has(e.id)}
                        currentUserId={currentUserId}
                        onToggleReaction={onToggleReaction}
                        addedByName={attribution.addedByName}
                        addedByInitials={attribution.addedByInitials}
                      />
                    );
                  })}
                </div>
              </CollapsibleContent>
            </Collapsible>
          );
        })}
        {weekTotal === 0 && weekIncome === 0 && (
          <p className="text-center text-ink-muted text-sm py-6">No expenses logged for this week.</p>
        )}
      </div>
    </section>
  );
}
