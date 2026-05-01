import { Expense, formatINR, startOfMonthISO } from "@/lib/expenses";
import { useMemo } from "react";

interface Props {
  expenses: Expense[];
}

export function MonthlyView({ expenses }: Props) {
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
    </section>
  );
}