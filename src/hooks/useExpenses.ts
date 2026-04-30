import { useCallback, useEffect, useState } from "react";
import {
  CategoryDef,
  DEFAULT_CATEGORIES,
  Expense,
} from "@/lib/expenses";

const EXP_KEY = "ledger.expenses.v1";
const CAT_KEY = "ledger.categories.v1";

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

export function useExpenses() {
  const [expenses, setExpenses] = useState<Expense[]>(() =>
    readJSON<Expense[]>(EXP_KEY, [])
  );
  const [categories, setCategories] = useState<CategoryDef[]>(() =>
    readJSON<CategoryDef[]>(CAT_KEY, DEFAULT_CATEGORIES)
  );

  useEffect(() => writeJSON(EXP_KEY, expenses), [expenses]);
  useEffect(() => writeJSON(CAT_KEY, categories), [categories]);

  const addExpense = useCallback((e: Omit<Expense, "id" | "created_at">) => {
    const newE: Expense = {
      ...e,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
    };
    setExpenses((prev) => [newE, ...prev]);
    return newE;
  }, []);

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

  return {
    expenses,
    categories,
    addExpense,
    deleteExpense,
    addCategory,
  };
}