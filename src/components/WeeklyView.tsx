import { Expense, dayLabel, formatINR, lastNDays } from "@/lib/expenses";
import { useMemo } from "react";
import { cn } from "@/lib/utils";

interface Props {
  expenses: Expense[];
}

export function WeeklyView({ expenses }: Props) {
  const days = useMemo(() => lastNDays(7), []);

  const totals = useMemo(() => {
    const map = new Map<string, number>();
    days.forEach((d) => map.set(d, 0));
    expenses.forEach((e) => {
      if (map.has(e.date)) map.set(e.date, (map.get(e.date) || 0) + e.amount);
    });
    return days.map((d) => ({ date: d, total: map.get(d) || 0 }));
  }, [expenses, days]);

  const max = Math.max(...totals.map((t) => t.total), 1);
  const weekTotal = totals.reduce((a, b) => a + b.total, 0);
  const peak = totals.reduce((a, b) => (b.total > a.total ? b : a), totals[0]);

  return (
    <section className="mt-16">
      <div className="flex items-baseline justify-between mb-8">
        <h3 className="text-[10px] tracking-[0.2em] uppercase font-medium text-ink-muted">
          Last 7 days
        </h3>
        <span className="font-serif text-xl text-foreground tabular-nums">
          ₹{formatINR(weekTotal)}
        </span>
      </div>

      <div className="flex items-end justify-between gap-2 h-40 px-1">
        {totals.map((t) => {
          const h = (t.total / max) * 100;
          const isPeak = t.total > 0 && t.date === peak.date;
          return (
            <div
              key={t.date}
              className="flex-1 flex flex-col items-center gap-2"
            >
              <span className="text-[10px] tabular-nums text-ink-muted">
                {t.total > 0 ? Math.round(t.total) : ""}
              </span>
              <div className="w-full flex-1 flex items-end">
                <div
                  className={cn(
                    "w-full rounded-t-md transition-all",
                    isPeak ? "bg-foreground" : "bg-wash-sage"
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
            </div>
          );
        })}
      </div>

      {peak.total > 0 && (
        <p className="mt-6 text-sm text-ink-muted text-center">
          Highest day:{" "}
          <span className="text-foreground">
            {new Date(peak.date + "T00:00:00").toLocaleDateString("en-US", {
              weekday: "long",
            })}
          </span>{" "}
          · ₹{formatINR(peak.total)}
        </p>
      )}
    </section>
  );
}