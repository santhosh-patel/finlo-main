/**
 * Normalize AI parser output to Finlo's category model and valid fields.
 */

export const DEFAULT_EXPENSE_CATEGORIES = [
  "Food",
  "Groceries",
  "Travel",
  "Bills",
  "Shopping",
  "Rent",
  "Misc",
  "Salon",
  "Lending",
  "Hehe",
] as const;

export const DEFAULT_INCOME_CATEGORIES = ["Salary", "Freelance", "Refund", "Other Income"] as const;

/** Map common model outputs to Finlo names */
const LEGACY_CATEGORY_MAP: Record<string, string> = {
  transport: "Travel",
  utilities: "Bills",
  housing: "Rent",
  entertainment: "Misc",
  medical: "Misc",
  tax: "Misc",
  other: "Misc",
  food: "Food",
  groceries: "Groceries",
  shopping: "Shopping",
  bills: "Bills",
  rent: "Rent",
  travel: "Travel",
  misc: "Misc",
  salon: "Salon",
  lending: "Lending",
  hehe: "Hehe",
  salary: "Salary",
  freelance: "Freelance",
  refund: "Refund",
  "other income": "Other Income",
  "other_income": "Other Income",
};

function normKey(s: string): string {
  return s.trim().toLowerCase().replace(/\s+/g, " ");
}

/** Pick closest category from allowed list (exact, legacy map, or substring). */
export function normalizeCategory(
  raw: unknown,
  allowed: string[],
): string {
  if (typeof raw !== "string" || !raw.trim()) {
    return allowed[0] ?? "Misc";
  }
  const t = raw.trim();
  const lower = normKey(t);

  const exact = allowed.find((c) => normKey(c) === lower);
  if (exact) return exact;

  const mapped = LEGACY_CATEGORY_MAP[lower];
  if (mapped) {
    const hit = allowed.find((c) => normKey(c) === normKey(mapped));
    if (hit) return hit;
  }

  for (const [legacy, finlo] of Object.entries(LEGACY_CATEGORY_MAP)) {
    if (lower.includes(legacy) || legacy.includes(lower)) {
      const hit = allowed.find((c) => normKey(c) === normKey(finlo));
      if (hit) return hit;
    }
  }

  const partial = allowed.find(
    (c) =>
      lower.includes(normKey(c)) ||
      normKey(c).includes(lower),
  );
  if (partial) return partial;

  return allowed[0] ?? "Misc";
}

export function normalizeAmount(raw: unknown): number | null {
  if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
    return Math.round(raw * 100) / 100;
  }
  if (typeof raw === "string") {
    const cleaned = raw.replace(/[₹$,]/g, "").replace(/rs\.?/i, "").trim();
    const n = parseFloat(cleaned);
    if (Number.isFinite(n) && n > 0) return Math.round(n * 100) / 100;
  }
  return null;
}

/** Heuristic: income phrasing (used when model returns wrong type category). */
export function noteLooksLikeIncome(note: string): boolean {
  const n = note.toLowerCase();
  return (
    /\b(salary|payroll|pay cheque|paycheck|freelance|invoice paid|client payment|refund credited|interest earned|dividend|bonus)\b/.test(
      n,
    ) ||
    /\b(credited|received|income)\b/.test(n)
  );
}
