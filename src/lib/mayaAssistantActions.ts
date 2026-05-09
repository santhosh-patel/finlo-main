import type { Expense, PaymentMethod } from "@/lib/expenses";

export type CategoryToAdd = {
  name: string;
  subcategories?: string[];
  type?: "expense" | "income";
};

export type TransactionToAdd = {
  amount: number;
  category: string;
  subcategory?: string | null;
  note?: string | null;
  date: string;
  txnType: NonNullable<Expense["type"]>;
  payment_method: PaymentMethod;
};

export type MayaAssistantActions = {
  categoriesToAdd: CategoryToAdd[];
  transactionsToAdd: TransactionToAdd[];
};

const DATE_RX = /^\d{4}-\d{2}-\d{2}$/;

export function coerceAssistantActionsFromApi(raw: unknown): MayaAssistantActions | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const cats: CategoryToAdd[] = [];
  const txns: TransactionToAdd[] = [];

  if (Array.isArray(o.categoriesToAdd)) {
    for (const row of o.categoriesToAdd) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const name = typeof r.name === "string" ? r.name.trim() : "";
      if (!name || name.length > 120) continue;
      const subcategories = Array.isArray(r.subcategories)
        ? r.subcategories.filter((x): x is string => typeof x === "string").map((s) => s.trim().toLowerCase()).filter(Boolean).slice(0, 40)
        : undefined;
      const type = r.type === "income" || r.type === "expense" ? r.type : undefined;
      cats.push(subcategories?.length ? { name, subcategories, type } : type ? { name, type } : { name });
    }
  }

  if (Array.isArray(o.transactionsToAdd)) {
    for (const row of o.transactionsToAdd) {
      if (!row || typeof row !== "object") continue;
      const r = row as Record<string, unknown>;
      const amt = typeof r.amount === "number" ? r.amount : Number(r.amount);
      if (!Number.isFinite(amt) || amt <= 0 || amt > 999_999_999) continue;
      const category = typeof r.category === "string" ? r.category.trim() : "";
      if (!category || category.length > 120) continue;
      const date = typeof r.date === "string" ? r.date.trim() : "";
      if (!DATE_RX.test(date)) continue;
      const sub =
        typeof r.subcategory === "string" && r.subcategory.trim()
          ? r.subcategory.trim().toLowerCase().slice(0, 80)
          : undefined;
      const note =
        typeof r.note === "string" && r.note.trim() ? r.note.trim().slice(0, 2000) : undefined;
      let txnType: "expense" | "income" = "expense";
      if (r.txnType === "income" || r.type === "income") txnType = "income";
      else if (r.txnType === "expense" || r.type === "expense") txnType = "expense";
      let pm: PaymentMethod = "upi";
      if (typeof r.payment_method === "string") {
        const p = r.payment_method.toLowerCase();
        if (p === "cash" || p === "card") pm = p as PaymentMethod;
        else if (p === "upi" || p === "bank" || p === "digital") pm = "upi";
      }
      txns.push({
        amount: Math.round(amt * 100) / 100,
        category,
        subcategory: sub ?? null,
        note: note ?? null,
        date,
        txnType,
        payment_method: pm,
      });
    }
  }

  cats.splice(10);
  txns.splice(20);

  if (cats.length === 0 && txns.length === 0) return null;
  return { categoriesToAdd: cats, transactionsToAdd: txns };
}

/** Drop actions that violate category existence rules (transactions before categories applied). */
export function validateAgainstKnownCategories(
  actions: MayaAssistantActions,
  knownCategoryNamesLower: Set<string>,
): MayaAssistantActions {
  const names = new Set(knownCategoryNamesLower);
  for (const c of actions.categoriesToAdd) {
    names.add(c.name.toLowerCase());
  }
  const transactionsToAdd = actions.transactionsToAdd.filter((t) =>
    names.has(t.category.toLowerCase())
  );
  return {
    categoriesToAdd: actions.categoriesToAdd,
    transactionsToAdd,
  };
}
