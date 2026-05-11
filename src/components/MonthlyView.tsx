import { getCurrencySymbol,  Expense, formatINR, monthRangeOf, baseAmountOf } from "@/lib/expenses";
import { Budgets } from "@/hooks/useExpenses";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Wallet, ChevronDown, Sparkles, Loader2, TrendingUp, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { ExpenseRow } from "@/components/ExpenseRow";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { supabase } from "@/integrations/supabase/client";
import { getIconForCategory, getColorForCategory } from "@/lib/categoryIcons";
import type { CategoryDef } from "@/lib/expenses";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip as RechartsTooltip, AreaChart, Area, XAxis, YAxis, CartesianGrid } from "recharts";

interface Props {
  expenses: Expense[];
  budgets: Budgets;
  onOpenBudgets: () => void;
  anchor: string;
  onSelect?: (e: Expense) => void;
  categories?: CategoryDef[];
  anomalyExpenseIds?: Set<string>;
}

interface Insight {
  text: string;
}

export function MonthlyView({ expenses, budgets, onOpenBudgets, anchor, onSelect, categories, anomalyExpenseIds }: Props) {
  const { from, to, label } = useMemo(() => monthRangeOf(anchor), [anchor]);
  const [openDay, setOpenDay] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [insightsError, setInsightsError] = useState<string | null>(null);
  const [selectedCategory, setSelectedCategory] = useState<string | null>(null);
  const [chartType, setChartType] = useState<"pie" | "trend">("pie");
  const [chartsOpen, setChartsOpen] = useState(false);

  const monthExpenses = useMemo(
    () => expenses.filter((e) => {
      const d = e.date.split("T")[0];
      return d >= from && d <= to && (e.type ?? "expense") === "expense";
    }),
    [expenses, from, to]
  );

  const monthIncomes = useMemo(
    () => expenses.filter((e) => {
      const d = e.date.split("T")[0];
      return d >= from && d <= to && e.type === "income";
    }),
    [expenses, from, to]
  );

  const monthAllTransactions = useMemo(
    () => expenses.filter((e) => {
      const d = e.date.split("T")[0];
      return d >= from && d <= to;
    }),
    [expenses, from, to]
  );

  const total = monthExpenses.reduce((a, b) => a + baseAmountOf(b), 0);
  const totalIncome = monthIncomes.reduce((a, b) => a + baseAmountOf(b), 0);
  const netAmount = totalIncome - total;
  const count = monthExpenses.length;
  const avg = count > 0 ? total / count : 0;

  // Month-over-Month calculation
  const lastMonthExpenses = useMemo(() => {
    const parts = from.split("-");
    let year = parseInt(parts[0]);
    let month = parseInt(parts[1]) - 1;
    if (month === 0) {
      month = 12;
      year -= 1;
    }
    const prevFrom = `${year}-${String(month).padStart(2, "0")}-01`;
    const prevTo = `${year}-${String(month).padStart(2, "0")}-${String(new Date(year, month, 0).getDate()).padStart(2, "0")}`;
    return expenses.filter((e) => {
      const d = e.date.split("T")[0];
      return d >= prevFrom && d <= prevTo && (e.type ?? "expense") === "expense";
    });
  }, [expenses, from]);

  const lastMonthTotal = useMemo(() => {
    return lastMonthExpenses.reduce((a, b) => a + baseAmountOf(b), 0);
  }, [lastMonthExpenses]);

  const prevMonthByCategory = useMemo(() => {
    const m = new Map<string, number>();
    lastMonthExpenses.forEach((e) =>
      m.set(e.category, (m.get(e.category) || 0) + baseAmountOf(e))
    );
    return m;
  }, [lastMonthExpenses]);

  const momDelta = useMemo(() => {
    if (lastMonthTotal === 0) return null;
    return ((total - lastMonthTotal) / lastMonthTotal) * 100;
  }, [total, lastMonthTotal]);

  const byCategory = useMemo(() => {
    const map = new Map<string, number>();
    monthExpenses.forEach((e) =>
      map.set(e.category, (map.get(e.category) || 0) + baseAmountOf(e))
    );
    return Array.from(map.entries())
      .map(([category, amount]) => ({ category, amount }))
      .sort((a, b) => b.amount - a.amount);
  }, [monthExpenses]);

  const top = byCategory[0];

  // Top 5 largest transactions (by base amount)
  const top5 = useMemo(() =>
    [...monthExpenses].sort((a, b) => baseAmountOf(b) - baseAmountOf(a)).slice(0, 5),
    [monthExpenses]
  );

  // AI insights
  const fetchInsights = useCallback(async () => {
    if (monthExpenses.length === 0) return;
    setInsightsLoading(true);
    setInsightsError(null);
    try {
      const summary = `Month: ${label}\nTotal: ${getCurrencySymbol()}${total.toFixed(2)}\nEntries: ${count}\nAvg per entry: ${getCurrencySymbol()}${avg.toFixed(2)}\n\nBy category:\n${byCategory.map((c) => `- ${c.category}: ${getCurrencySymbol()}${c.amount.toFixed(2)} (${total > 0 ? ((c.amount / total) * 100).toFixed(0) : 0}%)`).join("\n")}\n\nTop 5 transactions:\n${top5.map((e) => `- ${getCurrencySymbol()}${e.amount.toFixed(2)} ${e.category}${e.note ? ` (${e.note})` : ""} on ${e.date}`).join("\n")}`;
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
    monthAllTransactions.forEach((e) => {
      const dPart = e.date.split("T")[0];
      const list = map.get(dPart) || [];
      list.push(e);
      map.set(dPart, list);
    });
    return map;
  }, [monthAllTransactions]);

  const trendData = useMemo(() => {
    const daysInMonth = new Date(new Date(from).getFullYear(), new Date(from).getMonth() + 1, 0).getDate();
    const data = [];
    let runningTotal = 0;
    for (let i = 1; i <= daysInMonth; i++) {
      const dateStr = `${from.slice(0, 8)}${String(i).padStart(2, "0")}`;
      const dayTotal = monthExpenses.filter(e => e.date.split("T")[0] === dateStr).reduce((a, b) => a + b.amount, 0);
      runningTotal += dayTotal;
      data.push({
        day: i,
        amount: dayTotal,
        total: runningTotal,
        date: dateStr
      });
    }
    return data;
  }, [monthExpenses, from]);

  const sortedDays = Array.from(byDay.keys()).sort((a, b) => b.localeCompare(a));

  return (
    <section className="mt-8">
      <div className="flex items-start justify-between mb-8">
        <h3 className="text-[10px] tracking-[0.2em] uppercase font-medium text-ink-muted mt-1">
          {label}
        </h3>
        <div className="text-right space-y-1">
          <div className="font-serif text-xl text-foreground tabular-nums flex items-baseline justify-end gap-1">
            <span className="text-xs font-sans text-ink-muted">Out:</span>
            <span>{getCurrencySymbol()}{formatINR(total)}</span>
          </div>
          {momDelta !== null && (
            <div className="text-[10px] flex items-baseline justify-end gap-1.5 mt-0.5">
              <span className="text-ink-muted">MoM:</span>
              <span className={cn(
                "font-semibold flex items-center",
                momDelta > 0 ? "text-amber-500" : "text-emerald-500"
              )}>
                {momDelta > 0 ? "+" : ""}{momDelta.toFixed(1)}%
              </span>
              <span className="text-[9px] text-ink-muted/70">({getCurrencySymbol()}{formatINR(lastMonthTotal)} prev)</span>
            </div>
          )}
          {totalIncome > 0 && (
            <>
              <div className="font-serif text-sm text-emerald-600 dark:text-emerald-400 tabular-nums flex items-baseline justify-end gap-1">
                <span className="text-[10px] font-sans text-ink-muted">In:</span>
                <span>+{getCurrencySymbol()}{formatINR(totalIncome)}</span>
              </div>
              <div className={cn(
                "font-serif text-sm tabular-nums flex items-baseline justify-end gap-1 font-medium",
                netAmount >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
              )}>
                <span className="text-[10px] font-sans text-ink-muted">Net:</span>
                <span>{netAmount >= 0 ? "+" : "−"}{getCurrencySymbol()}{formatINR(Math.abs(netAmount))}</span>
              </div>
            </>
          )}
        </div>
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
            <p className="font-serif text-2xl text-foreground mt-1 tabular-nums">{getCurrencySymbol()}{formatINR(avg)}</p>
          </div>
        </div>

        <Collapsible open={chartsOpen} onOpenChange={setChartsOpen} className="mb-6">
          <CollapsibleTrigger className="flex w-full items-center justify-between rounded-xl border border-border/40 bg-surface/40 px-3 py-2.5 text-left text-[10px] uppercase tracking-wider text-ink-muted hover:bg-surface/60 transition-colors">
            <span>Charts (optional)</span>
            <ChevronDown className={cn("h-4 w-4 shrink-0 transition-transform", chartsOpen && "rotate-180")} />
          </CollapsibleTrigger>
          <CollapsibleContent className="pt-4 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="text-[10px] tracking-[0.2em] uppercase font-medium text-ink-muted">
                {chartType === "pie" ? "Category breakdown" : "Daily trend"}
              </h4>
              <div className="flex bg-surface rounded-full p-0.5 border border-border/20">
                <button
                  type="button"
                  onClick={() => setChartType("pie")}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-[9px] uppercase tracking-wider transition-all",
                    chartType === "pie" ? "bg-background text-foreground shadow-sm" : "text-ink-muted"
                  )}
                >Pie</button>
                <button
                  type="button"
                  onClick={() => setChartType("trend")}
                  className={cn(
                    "px-2.5 py-1 rounded-full text-[9px] uppercase tracking-wider transition-all",
                    chartType === "trend" ? "bg-background text-foreground shadow-sm" : "text-ink-muted"
                  )}
                >Trend</button>
              </div>
            </div>
            <div className="h-56">
              <ResponsiveContainer width="100%" height="100%">
                {chartType === "pie" ? (
                  <PieChart>
                    <Pie
                      data={byCategory}
                      dataKey="amount"
                      nameKey="category"
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={80}
                      paddingAngle={4}
                      stroke="none"
                      onClick={(data) => {
                        const cat = data?.category || data?.name;
                        if (cat) setSelectedCategory(cat);
                      }}
                    >
                      {byCategory.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={getColorForCategory(entry.category)} />
                      ))}
                    </Pie>
                    <RechartsTooltip
                      formatter={(value: number) => `${getCurrencySymbol()}${formatINR(value)}`}
                      contentStyle={{
                        backgroundColor: "hsl(var(--surface))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "12px",
                        fontSize: "12px",
                        color: "hsl(var(--foreground))"
                      }}
                      itemStyle={{ color: "hsl(var(--foreground))" }}
                    />
                  </PieChart>
                ) : (
                  <AreaChart data={trendData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                    <defs>
                      <linearGradient id="colorTotal" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--foreground))" stopOpacity={0.15}/>
                        <stop offset="95%" stopColor="hsl(var(--foreground))" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" opacity={0.3} />
                    <XAxis
                      dataKey="day"
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: "hsl(var(--ink-muted))" }}
                      interval={Math.floor(trendData.length / 7)}
                    />
                    <YAxis
                      axisLine={false}
                      tickLine={false}
                      tick={{ fontSize: 10, fill: "hsl(var(--ink-muted))" }}
                    />
                    <RechartsTooltip
                      formatter={(value: number) => [`${getCurrencySymbol()}${formatINR(value)}`, "Total Spent"]}
                      labelFormatter={(label) => `Day ${label}`}
                      contentStyle={{
                        backgroundColor: "hsl(var(--surface))",
                        border: "1px solid hsl(var(--border))",
                        borderRadius: "12px",
                        fontSize: "12px",
                        color: "hsl(var(--foreground))"
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="total"
                      stroke="hsl(var(--foreground))"
                      strokeWidth={2}
                      fillOpacity={1}
                      fill="url(#colorTotal)"
                      animationDuration={1000}
                    />
                  </AreaChart>
                )}
              </ResponsiveContainer>
            </div>
          </CollapsibleContent>
        </Collapsible>

        <div className="space-y-4">
          {byCategory.map((c) => {
            const pct = total > 0 ? (c.amount / total) * 100 : 0;
            const prevAmt = prevMonthByCategory.get(c.category) ?? 0;
            const catMom = prevAmt > 0 ? ((c.amount - prevAmt) / prevAmt) * 100 : null;
            return (
              <div 
                key={c.category} 
                className="group cursor-pointer"
                onClick={() => setSelectedCategory(c.category)}
              >
                <div className="flex justify-between items-baseline mb-1.5 gap-2">
                  <span className="text-foreground text-sm flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span 
                      className="w-2.5 h-2.5 rounded-full inline-block shrink-0" 
                      style={{ backgroundColor: getColorForCategory(c.category) }}
                    />
                    {c.category}
                    <span className="text-ink-muted text-xs tabular-nums">{pct.toFixed(0)}%</span>
                    {catMom !== null && (
                      <span
                        className={cn(
                          "text-[10px] font-medium tabular-nums",
                          catMom > 0 ? "text-amber-600 dark:text-amber-400" : "text-emerald-600 dark:text-emerald-400"
                        )}
                      >
                        {catMom > 0 ? "+" : ""}{catMom.toFixed(0)}% vs last mo
                      </span>
                    )}
                  </span>
                  <span className="font-serif text-base text-foreground tabular-nums shrink-0">
                    {getCurrencySymbol()}{formatINR(c.amount)}
                  </span>
                </div>
                <div className="h-1 bg-surface rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full transition-all duration-500 ease-out"
                    style={{ 
                      width: `${pct}%`,
                      backgroundColor: getColorForCategory(c.category) 
                    }}
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
                Top category is <span className="font-medium">{top.category}</span> at {getCurrencySymbol()}{formatINR(top.amount)}
                <span className="text-ink-muted"> · {total > 0 ? Math.round((top.amount / total) * 100) : 0}% of spend</span>
              </p>
            </div>

            {insights.map((ins, i) => (
              <div key={i} className="rounded-2xl border border-border/40 bg-surface/40 px-4 py-3">
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
                      {e.category}{e.subcategory ? ` · ${e.subcategory}` : ""} · {new Date(e.date.split("T")[0] + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                    </p>
                  </div>
                  <span className="font-serif text-lg text-foreground tabular-nums shrink-0">
                    {getCurrencySymbol()}{formatINR(e.amount)}
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
                      {getCurrencySymbol()}{formatINR(b.spent)} / {getCurrencySymbol()}{formatINR(b.limit)}
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
                      ? `Over by ${getCurrencySymbol()}${formatINR(Math.abs(b.remaining))}`
                      : `${getCurrencySymbol()}${formatINR(b.remaining)} remaining`}
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
                const itemsExp = items.filter((e) => (e.type ?? "expense") === "expense");
                const itemsInc = items.filter((e) => e.type === "income");
                const dayExpensesSum = itemsExp.reduce((a, b) => a + baseAmountOf(b), 0);
                const dayIncomeSum = itemsInc.reduce((a, b) => a + baseAmountOf(b), 0);
                const isOpen = openDay === d;
                return (
                  <Collapsible
                    id={`day-section-${d}`}
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
                        {new Date(d.split("T")[0] + "T00:00:00").toLocaleDateString("en-US", {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                        })}
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
                        {items.map((e) => (
                          <ExpenseRow
                            key={e.id}
                            expense={e}
                            onSelect={onSelect}
                            categories={categories}
                            showAnomaly={anomalyExpenseIds?.has(e.id)}
                          />
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

      {/* Category Filter Sheet */}
      <Sheet open={!!selectedCategory} onOpenChange={(open) => !open && setSelectedCategory(null)}>
        <SheetContent side="bottom" className="bg-background border-border rounded-t-[32px] max-h-[85vh] overflow-hidden flex flex-col p-0">
          <div className="px-6 pt-8 pb-4 shrink-0">
            <SheetHeader className="text-left flex flex-row items-center justify-between space-y-0">
              <div>
                <SheetTitle className="font-serif text-3xl font-normal text-foreground">
                  {selectedCategory}
                </SheetTitle>
                <p className="text-xs text-ink-muted mt-1">
                  {monthExpenses.filter(e => e.category === selectedCategory).length} transactions this month
                </p>
              </div>
              <div className="font-serif text-2xl text-foreground tabular-nums">
                {getCurrencySymbol()}{formatINR(monthExpenses.filter(e => e.category === selectedCategory).reduce((a, b) => a + b.amount, 0))}
              </div>
            </SheetHeader>
          </div>

          <div className="flex-1 overflow-y-auto px-6 pb-8">
            <div className="flex flex-col divide-y divide-border/50">
              {monthExpenses
                .filter(e => e.category === selectedCategory)
                .sort((a, b) => b.date.localeCompare(a.date))
                .map((e) => (
                  <ExpenseRow 
                    key={e.id} 
                    expense={e} 
                    onSelect={(exp) => {
                      setSelectedCategory(null);
                      onSelect?.(exp);
                    }} 
                    categories={categories}
                    showAnomaly={anomalyExpenseIds?.has(e.id)}
                  />
                ))}
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </section>
  );
}