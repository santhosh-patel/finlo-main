import { Expense } from "@/lib/expenses";
import { parseISO, differenceInDays, format } from "date-fns";

export interface DetectedSubscription {
  service_name: string;
  amount: number;
  category: string;
  billing_cycle: "monthly" | "weekly" | "yearly";
  confidence: number;
  last_date: string;
  count: number;
}

/**
 * Scans expenses for recurring patterns.
 * Criteria: Same amount and similar note/category appearing at least twice.
 */
export function detectSubscriptions(expenses: Expense[]): DetectedSubscription[] {
  if (expenses.length < 2) return [];

  const groups: Record<string, Expense[]> = {};

  expenses.forEach((e) => {
    if (e.type === "income") return;
    // Group by amount and category
    const key = `${e.amount}_${e.category}`;
    if (!groups[key]) groups[key] = [];
    groups[key].push(e);
  });

  const detected: DetectedSubscription[] = [];

  Object.values(groups).forEach((list) => {
    if (list.length < 2) return;

    // Sort by date ascending
    const sorted = [...list].sort((a, b) => a.date.localeCompare(b.date));

    // Check gaps between consecutive expenses
    for (let i = 0; i < sorted.length - 1; i++) {
      const d1 = parseISO(sorted[i].date);
      const d2 = parseISO(sorted[i+1].date);
      const gap = differenceInDays(d2, d1);

      let cycle: "monthly" | "weekly" | "yearly" | null = null;
      let confidence = 0;

      if (gap >= 25 && gap <= 35) {
        cycle = "monthly";
        confidence = 0.8;
      } else if (gap >= 6 && gap <= 8) {
        cycle = "weekly";
        confidence = 0.6;
      } else if (gap >= 350 && gap <= 380) {
        cycle = "yearly";
        confidence = 0.9;
      }

      if (cycle) {
        // Find if we already added this
        const existing = detected.find(d => d.amount === sorted[i].amount && d.category === sorted[i].category);
        if (existing) {
          existing.count++;
          existing.last_date = sorted[i+1].date;
        } else {
          detected.push({
            service_name: sorted[i].note || sorted[i].category,
            amount: sorted[i].amount,
            category: sorted[i].category,
            billing_cycle: cycle,
            confidence,
            last_date: sorted[i+1].date,
            count: 2
          });
        }
      }
    }
  });

  return detected.filter(d => d.count >= 2);
}
