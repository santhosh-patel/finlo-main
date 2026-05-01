import { Expense, formatINR, startOfMonthISO } from "@/lib/expenses";
import { Budgets } from "@/hooks/useExpenses";
import { useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Wallet } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  expenses: Expense[];
  budgets: Budgets;
  onOpenBudgets: () => void;
}

export function MonthlyView({ expenses, budgets, onOpenBudgets }: Props) {
  const monthStart = startOfMonthISO();
  const monthName = new Date().toLocaleDateString("en-US", { month: "long" });

  const monthExpenses = useMemo(
    () => expenses.filter((e) => e.date >= monthStart),
    [expenses, monthStart]
  );

  const total = monthExpenses.reduce((a, b) => a + b.amount, 0);
  const count = monthExpenses.length;
  const avg = count > 0 ? total / count : 0;

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    monthExpenses.forEach((e) =>
      map.set(e.category, (map.get(e.category) || 0) + e.amount)
    );
    return Array.from(map.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [monthExpenses]);

  const top = byCategory[0];

  const budgetEntries = useMemo(() => {
    return Object.entries(budgets).map(([category, limit]) => {
      const spent =
        byCategory.find((b) => b.category === category)?.amount || 0;
      const remaining = limit - spent;
      const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
      return { category, limit, spent, remaining, pct };
    });
  }, [budgets, byCategory]);

  return (
    <section className="mt-20">
      <div className="flex items-baseline justify-between mb-8">
        <h3 className="text-[10px] tracking-[0.2em] uppercase font-medium text-ink-muted">
          {monthName} so far
        </h3>
        <span className="font-serif text-xl text-foreground tabular-nums">
          ₹{formatINR(total)}
        </span>
      </div>

      {byCategory.length === 0 ? (
        <p className="text-center text-ink-muted text-sm py-8">
          No expenses logged this month yet.
        </p>
      ) : (
        <>
        <div className="grid grid-cols-2 gap-3 mb-8">
          <div className="bg-surface/60 rounded-2xl p-4 border border-border/40">
            <p className="text-[10px] tracking-[0.2em] uppercase text-ink-muted">Entries</p>
            <p className="font-serif text-2xl text-foreground mt-1 tabular-nums">{count}</p>
          </div>
          <div className="bg-surface/60 rounded-2xl p-4 border border-border/40">
            <p className="text-[10px] tracking-[0.2em] uppercase text-ink-muted">Avg / entry</p>
            <p className="font-serif text-2xl text-foreground mt-1 tabular-nums">₹{formatINR(avg)}</p>
          </div>
        </div>
        <div className="space-y-4">
          {byCategory.map((c) => {
            const pct = total > 0 ? (c.amount / total) * 100 : 0;
            return (
              <div key={c.category}>
                <div className="flex justify-between items-baseline mb-1.5">
                  <span className="text-foreground text-sm">
                    {c.category}
                    <span className="text-ink-muted ml-2 text-xs tabular-nums">{pct.toFixed(0)}%</span>
                  </span>
                  <span className="font-serif text-base text-foreground tabular-nums">
                    ₹{formatINR(c.amount)}
                  </span>
                </div>
                <div className="h-1 bg-surface rounded-full overflow-hidden">
                  <div
                    className="h-full bg-wash-sage rounded-full"
                    style={{ width: `${pct}%` }}
                  />
                </div>
              </div>
            );
          })}
        </div>
        </>
      )}

      {top && (
        <div className="mt-10 bg-wash-clay/40 rounded-3xl p-6 border border-border/40">
          <p className="text-[10px] tracking-[0.2em] uppercase text-ink-muted mb-2">
            Insight
          </p>
          <p className="font-serif text-xl text-foreground leading-snug">
            Top category this month is{" "}
            <span className="italic">{top.category}</span> at{" "}
            ₹{formatINR(top.amount)}.
          </p>
        </div>
      )}

      {/* Budgets */}
      <div className="mt-12">
        <div className="flex items-baseline justify-between mb-5">
          <h3 className="text-[10px] tracking-[0.2em] uppercase font-medium text-ink-muted">
            Budgets
          </h3>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={onOpenBudgets}
            className="text-xs text-ink-muted hover:text-foreground h-7"
          >
            <Wallet className="h-3.5 w-3.5 mr-1" />
            {budgetEntries.length === 0 ? "Set budgets" : "Manage"}
          </Button>
        </div>

        {budgetEntries.length === 0 ? (
          <p className="text-ink-muted text-sm font-light text-center py-4">
            No budgets yet. Set monthly limits per category to track what's left.
          </p>
        ) : (
          <div className="space-y-4">
            {budgetEntries.map((b) => {
              const over = b.remaining < 0;
              return (
                <div
                  key={b.category}
                  className="bg-surface/60 border border-border/40 rounded-2xl p-4"
                >
                  <div className="flex justify-between items-baseline mb-2">
                    <span className="text-foreground text-sm">{b.category}</span>
                    <span
                      className={cn(
                        "text-xs tabular-nums",
                        over ? "text-destructive" : "text-ink-muted"
                      )}
                    >
                      ₹{formatINR(b.spent)} / ₹{formatINR(b.limit)}
                    </span>
                  </div>
                  <div className="h-1.5 bg-background rounded-full overflow-hidden">
                    <div
                      className={cn(
                        "h-full rounded-full transition-all",
                        over ? "bg-destructive" : "bg-wash-sage"
                      )}
                      style={{ width: `${b.pct}%` }}
                    />
                  </div>
                  <p
                    className={cn(
                      "mt-2 text-[11px] tabular-nums",
                      over ? "text-destructive" : "text-ink-muted"
                    )}
                  >
                    {over
                      ? `Over by ₹${formatINR(Math.abs(b.remaining))}`
                      : `₹${formatINR(b.remaining)} remaining`}
                  </p>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </section>
  );
}