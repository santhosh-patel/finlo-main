import { useEffect, useRef } from "react";
import { toast } from "@/hooks/use-toast";
import type { Budgets } from "@/hooks/useExpenses";
import { getCurrencySymbol, formatINR } from "@/lib/expenses";

const NOTIFIED_KEY = "finlo.budget_alerts.v1";
const WARN_PCT = 0.8;

type Notified = Record<string, { month: string; level: "warn" | "over" }>;

function readNotified(): Notified {
  try { return JSON.parse(localStorage.getItem(NOTIFIED_KEY) || "{}"); } catch { return {}; }
}

export function useBudgetAlerts(spentByCategory: Record<string, number>, budgets: Budgets) {
  const seenRef = useRef<Notified>(readNotified());

  useEffect(() => {
    const month = new Date().toISOString().slice(0, 7);
    const next = { ...seenRef.current };
    let changed = false;

    Object.entries(budgets).forEach(([cat, limit]) => {
      if (!limit || limit <= 0) return;
      const spent = spentByCategory[cat] || 0;
      const pct = spent / limit;
      const prev = next[cat];
      const prevSameMonth = prev?.month === month ? prev.level : null;

      if (pct >= 1 && prevSameMonth !== "over") {
        toast({
          title: `Over budget · ${cat}`,
          description: `Spent ${getCurrencySymbol()}${formatINR(spent)} of ${getCurrencySymbol()}${formatINR(limit)} this month.`,
          variant: "destructive",
        });
        next[cat] = { month, level: "over" };
        changed = true;
      } else if (pct >= WARN_PCT && pct < 1 && !prevSameMonth) {
        toast({
          title: `${Math.round(pct * 100)}% of ${cat} budget used`,
          description: `${getCurrencySymbol()}${formatINR(limit - spent)} left of ${getCurrencySymbol()}${formatINR(limit)} this month.`,
        });
        next[cat] = { month, level: "warn" };
        changed = true;
      }
    });

    if (changed) {
      seenRef.current = next;
      try { localStorage.setItem(NOTIFIED_KEY, JSON.stringify(next)); } catch { /* ignore */ }
    }
  }, [spentByCategory, budgets]);
}
