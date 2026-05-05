import { Expense, formatINR, monthRangeOf } from "@/lib/expenses";
import { Budgets } from "@/hooks/useExpenses";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Wallet, ChevronDown, Sparkles, Loader2, TrendingUp } from "lucide-react";
import { cn } from "@/lib/utils";
import { ExpenseRow } from "@/components/ExpenseRow";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { getIconForCategory, getColorForCategory } from "@/lib/categoryIcons";
import type { CategoryDef } from "@/lib/expenses";

interface Props {
  expenses: Expense[];
  budgets: Budgets;
  onOpenBudgets: () => void;
  anchor: string;
  onSelect?: (e: Expense) => void;
  categories?: CategoryDef[];
}

interface Insight {
  emoji: string;
  text: string;
}

export function MonthlyView({ expenses, budgets, onOpenBudgets, anchor, onSelect, categories }: Props) {
  const { from, to, label } = useMemo(() => monthRangeOf(anchor), [anchor]);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);

  const monthExpenses = useMemo(
    () => expenses.filter((e) => e.date >= from && e.date <= to),
    [expenses, from, to]
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

  // Top 5 largest transactions
  const top5 = useMemo(() =>
    [...monthExpenses].sort((a, b) => b.amount - a.amount).slice(0, 5),
    [monthExpenses]
  );

  // AI insights
  const fetchInsights = useCallback(async () => {
    if (monthExpenses.length === 0) return;
    setInsightsLoading(true);
    setInsightsError(null);
    try {
      const summary = `Month: ${label}\nTotal: ₹${total.toFixed(2)}\nEntries: ${count}\nAvg per entry: ₹${avg.toFixed(2)}\n\nBy category:\n${byCategory.map((c) => `- ${c.category}: ₹${c.amount.toFixed(2)} (${total > 0 ? ((c.amount / total) * 100).toFixed(0) : 0}%)`).join("\n")}\n\nTop 5 transactions:\n${top5.map((e) => `- ₹${e.amount.toFixed(2)} ${e.category}${e.note ? ` (${e.note})` : ""} on ${e.date}`).join("\n")}`;
      const { data, error } = await supabase.functions.invoke("spending-insights", {
        body: { summary },
      });
      if (error) throw error;
      setInsights(data?.insights ?? []);
    } catch (e) {
      console.error("Insights error:", e);
      setInsightsError("Couldn't generate insights right now.");
    } finally {
      setInsightsLoading(false);
    }
  }, [monthExpenses.length, label, total, count, avg, byCategory, top5]);

  const budgetEntries = useMemo(() => {
    return Object.entries(budgets).map(([category, limit]) => {
      const spent =
        byCategory.find((b) => b.category === category)?.amount || 0;
      const remaining = limit - spent;
      const pct = limit > 0 ? Math.min(100, (spent / limit) * 100) : 0;
      return { category, limit, spent, remaining, pct };
    });
  }, [budgets, byCategory]);

  // Group by day for transactions list
  const byDay = useMemo(() => {
    const map = new Map<string, Expense[]>();
    monthExpenses.forEach((e) => {
      const list = map.get(e.date) || [];
      list.push(e);
      map.set(e.date, list);
    });
    return map;
  }, [monthExpenses]);

  const sortedDays = Array.from(byDay.keys()).sort((a, b) => b.localeCompare(a));

  return (
    <section className="mt-8">
      <div className="flex items-baseline justify-between mb-8">
        <h3 className="text-[10px] tracking-[0.2em] uppercase font-medium text-ink-muted">
          {label}
        </h3>
        <span className="font-serif text-xl text-foreground tabular-nums">
          ₹{formatINR(total)}
        </span>
      </div>

      {byCategory.length === 0 ? (
        <p className="text-center text-ink-muted text-sm py-8">
          No expenses logged for this month.
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
        <div className="mt-10">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-[10px] tracking-[0.2em] uppercase font-medium text-ink-muted inline-flex items-center gap-1.5">
              <Sparkles className="h-3 w-3" /> Insights
            </h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={fetchInsights}
              disabled={insightsLoading}
              className="text-xs text-ink-muted hover:text-foreground h-7"
            >
              {insightsLoading ? <Loader2 className="h-3 w-3 animate-spin" /> : insights.length > 0 ? "Refresh" : "Generate"}
            </Button>
          </div>

          <div className="space-y-2">
            <div className="rounded-2xl border border-border/40 bg-surface/40 px-4 py-3">
              <p className="text-sm text-foreground leading-snug">
                Top category is <span className="font-medium">{top.category}</span> at ₹{formatINR(top.amount)}
                <span className="text-ink-muted"> · {total > 0 ? Math.round((top.amount / total) * 100) : 0}% of spend</span>
              </p>
            </div>

            {insights.map((ins, i) => (
              <div key={i} className="rounded-2xl border border-border/40 bg-surface/40 px-4 py-3 flex gap-3">
                <span className="text-base leading-snug shrink-0" aria-hidden>{ins.emoji}</span>
                <p className="text-sm text-foreground leading-snug">{ins.text}</p>
              </div>
            ))}

            {insights.length === 0 && !insightsLoading && (
              <p className="text-xs text-ink-muted px-1">
                {insightsError ?? "Tap Generate for AI-powered tips on this month's spending."}
              </p>
            )}
          </div>
        </div>
      )}

      {/* Top 5 Transactions */}
      {top5.length > 0 && (
        <div className="mt-12">
          <div className="flex items-baseline justify-between mb-5">
            <h3 className="text-[10px] tracking-[0.2em] uppercase font-medium text-ink-muted inline-flex items-center gap-1.5">
              <TrendingUp className="h-3 w-3" /> Top 5 Transactions
            </h3>
          </div>
          <div className="space-y-1">
            {top5.map((e, i) => {
              const Icon = getIconForCategory(e.category);
              const color = getColorForCategory(e.category, categories?.find((c) => c.name === e.category)?.color);
              return (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => onSelect?.(e)}
                  className="w-full flex items-center gap-3 px-3 py-3 rounded-2xl hover:bg-surface/60 transition-colors text-left group"
                >
                  <span className="text-[11px] text-ink-muted/60 font-mono w-5 text-right shrink-0">
                    {i + 1}
                  </span>
                  <span
                    className="h-8 w-8 rounded-full flex items-center justify-center shrink-0"
                    style={{ backgroundColor: color }}
                  >
                    <Icon className="h-3.5 w-3.5 text-foreground" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm text-foreground truncate">
                      {e.note || e.category}
                    </p>
                    <p className="text-[11px] text-ink-muted truncate">
                      {e.category}{e.subcategory ? ` · ${e.subcategory}` : ""} · {new Date(e.date + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                  </div>
                  <span className="font-serif text-lg text-foreground tabular-nums shrink-0">
                    ₹{formatINR(e.amount)}
                  </span>
                </button>
              );
            })}
          </div>
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

      {/* Transactions */}
      {sortedDays.length > 0 && (
        <div className="mt-12">
          <div className="flex items-baseline justify-between mb-5">
            <h3 className="text-[10px] tracking-[0.2em] uppercase font-medium text-ink-muted">
              Transactions
            </h3>
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => setShowAll((s) => !s)}
              className="text-xs text-ink-muted hover:text-foreground h-7"
            >
              {showAll ? "Hide" : "Show all"}
            </Button>
          </div>
          {showAll && (
            <div className="space-y-2">
              {sortedDays.map((d) => {
                const items = byDay.get(d) || [];
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
                          weekday: "short",
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
            </div>
          )}
        </div>
      )}
    </section>
  );
}