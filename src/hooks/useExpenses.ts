import { useCallback, useEffect, useState } from "react";
import {
  CategoryDef,
  DEFAULT_CATEGORIES,
  Expense,
} from "@/lib/expenses";

const EXP_KEY = "ledger.expenses.v1";
const CAT_KEY = "ledger.categories.v1";
const BUD_KEY = "ledger.budgets.v1";

function readJSON<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

function writeJSON(key: string, value: unknown) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // ignore quota errors
  }
}

export type Budgets = Record<string, number>; // category name -> monthly limit

export function useExpenses() {
  const [expenses, setExpenses] = useState<Expense[]>(() =>
    readJSON<Expense[]>(EXP_KEY, [])
  );
  const [categories, setCategories] = useState<CategoryDef[]>(() =>
    readJSON<CategoryDef[]>(CAT_KEY, DEFAULT_CATEGORIES)
  );
  const [budgets, setBudgets] = useState<Budgets>(() =>
    readJSON<Budgets>(BUD_KEY, {})
  );

  useEffect(() => writeJSON(EXP_KEY, expenses), [expenses]);
  useEffect(() => writeJSON(CAT_KEY, categories), [categories]);
  useEffect(() => writeJSON(BUD_KEY, budgets), [budgets]);

  const addExpense = useCallback((e: Omit<Expense, "id" | "created_at">) => {
    const newE: Expense = {
      ...e,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    setExpenses((prev) => [newE, ...prev]);
    return newE;
  }, []);

  const updateExpense = useCallback(
    (id: string, patch: Partial<Omit<Expense, "id" | "created_at">>) => {
      setExpenses((prev) =>
        prev.map((x) => (x.id === id ? { ...x, ...patch } : x))
      );
    },
    []
  );

  const deleteExpense = useCallback((id: string) => {
    setExpenses((prev) => prev.filter((x) => x.id !== id));
  }, []);

  const addCategory = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCategories((prev) =>
      prev.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())
        ? prev
        : [...prev, { name: trimmed, subcategories: [], custom: true }]
    );
  }, []);

  const renameCategory = useCallback((oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    setCategories((prev) =>
      prev.map((c) => (c.name === oldName ? { ...c, name: trimmed } : c))
    );
    setExpenses((prev) =>
      prev.map((e) => (e.category === oldName ? { ...e, category: trimmed } : e))
    );
    setBudgets((prev) => {
      if (!(oldName in prev)) return prev;
      const next = { ...prev };
      next[trimmed] = next[oldName];
      delete next[oldName];
      return next;
    });
  }, []);

  const deleteCategory = useCallback((name: string) => {
    setCategories((prev) => prev.filter((c) => c.name !== name));
    setBudgets((prev) => {
      const next = { ...prev };
      delete next[name];
      return next;
    });
  }, []);

  const setCategoryStyle = useCallback(
    (name: string, patch: { color?: string; icon?: string }) => {
      setCategories((prev) =>
        prev.map((c) => (c.name === name ? { ...c, ...patch } : c))
      );
    },
    []
  );

  const addSubcategory = useCallback((category: string, sub: string) => {
    const s = sub.trim().toLowerCase();
    if (!s) return;
    setCategories((prev) =>
      prev.map((c) => {
        if (c.name !== category) return c;
        if (c.subcategories.some((x) => x.toLowerCase() === s)) return c;
        return { ...c, subcategories: [...c.subcategories, s] };
      })
    );
  }, []);

  const deleteSubcategory = useCallback((category: string, sub: string) => {
    setCategories((prev) =>
      prev.map((c) =>
        c.name === category
          ? { ...c, subcategories: c.subcategories.filter((x) => x !== sub) }
          : c
      )
    );
  }, []);

  const importExpenses = useCallback(
    (rows: Omit<Expense, "id" | "created_at">[]) => {
      const now = Date.now();
      const newOnes: Expense[] = rows.map((r, i) => ({
        ...r,
        id: crypto.randomUUID(),
        created_at: new Date(now - i).toISOString(),
      }));
      setExpenses((prev) => [...newOnes, ...prev]);
      // auto-create missing categories
      setCategories((prev) => {
        const existing = new Set(prev.map((c) => c.name.toLowerCase()));
        const adds: CategoryDef[] = [];
        rows.forEach((r) => {
          const k = r.category.trim();
          if (k && !existing.has(k.toLowerCase())) {
            existing.add(k.toLowerCase());
            adds.push({ name: k, subcategories: [], custom: true });
          }
        });
        return adds.length ? [...prev, ...adds] : prev;
      });
      return newOnes.length;
    },
    []
  );

  const setBudget = useCallback((category: string, amount: number | null) => {
    setBudgets((prev) => {
      const next = { ...prev };
      if (amount === null || !amount || amount <= 0) delete next[category];
      else next[category] = amount;
      return next;
    });
  }, []);

  return {
    expenses,
    categories,
    budgets,
    addExpense,
    updateExpense,
    deleteExpense,
    addCategory,
    renameCategory,
    deleteCategory,
    setCategoryStyle,
    addSubcategory,
    deleteSubcategory,
    importExpenses,
    setBudget,
  };
}