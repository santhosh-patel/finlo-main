import { CategoryDef, Expense, dayLabel, formatINR, rangeDays, weekRangeOf } from "@/lib/expenses";
import { useMemo, useState } from "react";
import { cn } from "@/lib/utils";
import { ExpenseRow } from "@/components/ExpenseRow";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ChevronDown } from "lucide-react";

interface Props {
  expenses: Expense[];
  categories: CategoryDef[];
  anchor: string;
  onSelect?: (e: Expense) => void;
}

export function WeeklyView({ expenses, categories, anchor, onSelect }: Props) {
  const { from, to, label } = useMemo(() => weekRangeOf(anchor), [anchor]);
  const days = useMemo(() => rangeDays(from, to), [from, to]);
  const [openDay, setOpenDay] = useState<string | null>(null);

  const colorOf = (name: string) =>
    categories.find((c) => c.name === name)?.color || "hsl(var(--wash-sage))";

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

  // Per day: { total, segments: [{ category, amount }] }
  const dayStats = days.map((d) => {
    const items = byDay.get(d) || [];
    const total = items.reduce((a, b) => a + b.amount, 0);
    const m: Record<string, number> = {};
    items.forEach((e) => { m[e.category] = (m[e.category] || 0) + e.amount; });
    const segments = Object.entries(m)
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
    return { date: d, total, segments };
  });

  const maxTotal = Math.max(...dayStats.map((d) => d.total), 1);
  const weekTotal = dayStats.reduce((a, b) => a + b.total, 0);

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
      <div className="flex items-baseline justify-between mb-6">
        <h3 className="text-[10px] tracking-[0.2em] uppercase font-medium text-ink-muted">{label}</h3>
        <span className="font-serif text-xl text-foreground tabular-nums">₹{formatINR(weekTotal)}</span>
      </div>

      {legend.length > 0 && (
        <div className="flex flex-wrap gap-2 mb-4">
          {legend.map((l) => (
            <span key={l.category} className="inline-flex items-center gap-1.5 text-[11px] text-ink-muted">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: colorOf(l.category) }} />
              {l.category}
            </span>
          ))}
        </div>
      )}

      <div className="flex items-end justify-between gap-2 h-44 px-1 mb-8">
        {dayStats.map((d) => {
          const heightPct = (d.total / maxTotal) * 100;
          const isOpen = openDay === d.date;
          return (
            <button
              type="button" key={d.date}
              onClick={() => setOpenDay(isOpen ? null : d.date)}
              className="flex-1 flex flex-col items-center gap-2 group"
            >
              <span className="text-[10px] tabular-nums text-ink-muted">
                {d.total > 0 ? Math.round(d.total) : ""}
              </span>
              <div className="w-full flex-1 flex items-end">
                <div
                  className={cn(
                    "w-full rounded-t-md overflow-hidden flex flex-col-reverse transition-all group-hover:opacity-90",
                    isOpen && "ring-2 ring-foreground/40"
                  )}
                  style={{ height: `${Math.max(heightPct, d.total > 0 ? 6 : 2)}%`, minHeight: 4 }}
                >
                  {d.total === 0 ? (
                    <div className="w-full h-full bg-surface" />
                  ) : (
                    d.segments.map((s) => (
                      <div
                        key={s.category}
                        title={`${s.category} · ₹${formatINR(s.amount)}`}
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
                  "text-[10px] tracking-wider uppercase",
                  isOpen ? "text-foreground font-medium" : "text-ink-muted"
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
          const dayTotal = items.reduce((a, b) => a + b.amount, 0);
          const isOpen = openDay === d;
          return (
            <Collapsible key={d} open={isOpen} onOpenChange={(v) => setOpenDay(v ? d : null)}>
              <CollapsibleTrigger className="w-full flex items-center justify-between px-3 py-2.5 rounded-xl bg-surface/50 hover:bg-surface transition-colors text-left">
                <span className="flex items-center gap-2 text-sm text-foreground">
                  <ChevronDown className={cn("h-3.5 w-3.5 text-ink-muted transition-transform", isOpen && "rotate-180")} />
                  {new Date(d + "T00:00:00").toLocaleDateString("en-US", { weekday: "long", month: "short", day: "numeric" })}
                  <span className="text-ink-muted text-xs">({items.length})</span>
                </span>
                <span className="font-serif text-base text-foreground tabular-nums">₹{formatINR(dayTotal)}</span>
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
          <p className="text-center text-ink-muted text-sm py-6">No expenses logged for this week.</p>
        )}
      </div>
    </section>
  );
}
