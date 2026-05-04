import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  CategoryDef,
  DEFAULT_CATEGORIES,
  Expense,
} from "@/lib/expenses";
import { toast } from "@/hooks/use-toast";

const EXP_KEY = "finlo.expenses.v1";
const CAT_KEY = "finlo.categories.v1";
const BUD_KEY = "finlo.budgets.v1";
const PENDING_KEY = "finlo.pending.v1";
const LAST_SYNC_KEY = "finlo.last_sync.v1";

export type Budgets = Record<string, number>;

type PendingOp =
  | { kind: "insert"; row: Expense }
  | { kind: "update"; id: string; patch: Partial<Expense> }
  | { kind: "delete"; id: string };

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
  try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ }
}

export function useExpenses(userId: string | null) {
  const [expenses, setExpenses] = useState<Expense[]>(() => readJSON<Expense[]>(EXP_KEY, []));
  const [categories, setCategories] = useState<CategoryDef[]>(() =>
    readJSON<CategoryDef[]>(CAT_KEY, DEFAULT_CATEGORIES)
  );
  const [budgets, setBudgets] = useState<Budgets>(() => readJSON<Budgets>(BUD_KEY, {}));
  const [syncing, setSyncing] = useState(false);
  const [lastSync, setLastSync] = useState<string | null>(
    () => localStorage.getItem(LAST_SYNC_KEY)
  );
  const pendingRef = useRef<PendingOp[]>(readJSON<PendingOp[]>(PENDING_KEY, []));

  useEffect(() => writeJSON(EXP_KEY, expenses), [expenses]);
  useEffect(() => writeJSON(CAT_KEY, categories), [categories]);
  useEffect(() => writeJSON(BUD_KEY, budgets), [budgets]);

  const queue = (op: PendingOp) => {
    pendingRef.current.push(op);
    writeJSON(PENDING_KEY, pendingRef.current);
  };

  const flushPending = useCallback(async () => {
    if (!userId || !navigator.onLine) return;
    const ops = [...pendingRef.current];
    if (ops.length === 0) return;
    for (const op of ops) {
      try {
        if (op.kind === "insert") {
          await supabase.from("expenses").insert({
            id: op.row.id,
            user_id: userId,
            amount: op.row.amount,
            category: op.row.category,
            subcategory: op.row.subcategory ?? null,
            note: op.row.note ?? null,
            date: op.row.date,
            payment_method: op.row.payment_method,
          });
        } else if (op.kind === "update") {
          await supabase.from("expenses").update({
            ...(op.patch.amount !== undefined && { amount: op.patch.amount }),
            ...(op.patch.category !== undefined && { category: op.patch.category }),
            ...(op.patch.subcategory !== undefined && { subcategory: op.patch.subcategory ?? null }),
            ...(op.patch.note !== undefined && { note: op.patch.note ?? null }),
            ...(op.patch.date !== undefined && { date: op.patch.date }),
            ...(op.patch.payment_method !== undefined && { payment_method: op.patch.payment_method }),
          }).eq("id", op.id);
        } else if (op.kind === "delete") {
          await supabase.from("expenses").delete().eq("id", op.id);
        }
      } catch (e) {
        console.error("sync op failed", e);
      }
    }
    pendingRef.current = [];
    writeJSON(PENDING_KEY, []);
  }, [userId]);

  const pullFromServer = useCallback(async () => {
    if (!userId) return;
    const [{ data: exp }, { data: cat }, { data: bud }] = await Promise.all([
      supabase.from("expenses").select("*").eq("user_id", userId).order("date", { ascending: false }).order("created_at", { ascending: false }),
      supabase.from("categories").select("*").eq("user_id", userId),
      supabase.from("budgets").select("*").eq("user_id", userId),
    ]);
    if (exp) {
      setExpenses(exp.map((r) => ({
        id: r.id,
        amount: Number(r.amount),
        category: r.category,
        subcategory: r.subcategory ?? undefined,
        note: r.note ?? undefined,
        date: r.date,
        payment_method: (r.payment_method as Expense["payment_method"]) ?? "upi",
        created_at: r.created_at,
      })));
    }
    if (cat && cat.length > 0) {
      setCategories(cat.map((c) => ({
        name: c.name,
        subcategories: c.subcategories ?? [],
        color: c.color ?? undefined,
        icon: c.icon ?? undefined,
        custom: true,
      })));
    } else if (cat && cat.length === 0) {
      // seed defaults to server on first sync
      const rows = DEFAULT_CATEGORIES.map((c) => ({
        user_id: userId,
        name: c.name,
        subcategories: c.subcategories,
        color: c.color ?? null,
        icon: c.icon ?? null,
      }));
      await supabase.from("categories").upsert(rows, { onConflict: "user_id,name" });
    }
    if (bud) {
      const m: Budgets = {};
      bud.forEach((b) => { m[b.category] = Number(b.amount_monthly); });
      setBudgets(m);
    }
    const ts = new Date().toISOString();
    setLastSync(ts);
    localStorage.setItem(LAST_SYNC_KEY, ts);
  }, [userId]);

  const sync = useCallback(async () => {
    if (!userId) return;
    setSyncing(true);
    try {
      await flushPending();
      await pullFromServer();
      toast({ title: "Synced", description: "All changes are up to date." });
    } catch (e) {
      console.error(e);
      toast({ title: "Sync failed", description: String(e), variant: "destructive" });
    } finally {
      setSyncing(false);
    }
  }, [userId, flushPending, pullFromServer]);

  // Initial sync + realtime
  useEffect(() => {
    if (!userId) return;
    let cancelled = false;
    let pullTimer: ReturnType<typeof setTimeout> | null = null;
    const debouncedPull = () => {
      if (pullTimer) clearTimeout(pullTimer);
      pullTimer = setTimeout(() => { if (!cancelled) pullFromServer(); }, 400);
    };
    sync();
    const ch = supabase
      .channel(`expenses-${userId}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "expenses", filter: `user_id=eq.${userId}` },
        () => debouncedPull(),
      )
      .subscribe();
    const onOnline = () => { if (!cancelled) sync(); };
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      if (pullTimer) clearTimeout(pullTimer);
      supabase.removeChannel(ch);
      window.removeEventListener("online", onOnline);
    };
  }, [userId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ------- mutators (optimistic local + queue/server) -------
  const addExpense = useCallback((e: Omit<Expense, "id" | "created_at">) => {
    const newE: Expense = { ...e, id: crypto.randomUUID(), created_at: new Date().toISOString() };
    setExpenses((prev) => [newE, ...prev]);
    if (userId) {
      supabase.from("expenses").insert({
        id: newE.id, user_id: userId, amount: newE.amount, category: newE.category,
        subcategory: newE.subcategory ?? null, note: newE.note ?? null,
        date: newE.date, payment_method: newE.payment_method,
      }).then(({ error }) => { if (error) queue({ kind: "insert", row: newE }); });
    } else {
      queue({ kind: "insert", row: newE });
    }
    return newE;
  }, [userId]);

  const updateExpense = useCallback((id: string, patch: Partial<Omit<Expense, "id" | "created_at">>) => {
    setExpenses((prev) => prev.map((x) => (x.id === id ? { ...x, ...patch } : x)));
    if (userId) {
      supabase.from("expenses").update({
        ...(patch.amount !== undefined && { amount: patch.amount }),
        ...(patch.category !== undefined && { category: patch.category }),
        ...(patch.subcategory !== undefined && { subcategory: patch.subcategory ?? null }),
        ...(patch.note !== undefined && { note: patch.note ?? null }),
        ...(patch.date !== undefined && { date: patch.date }),
        ...(patch.payment_method !== undefined && { payment_method: patch.payment_method }),
      }).eq("id", id).then(({ error }) => { if (error) queue({ kind: "update", id, patch }); });
    } else {
      queue({ kind: "update", id, patch });
    }
  }, [userId]);

  const deleteExpense = useCallback((id: string) => {
    setExpenses((prev) => prev.filter((x) => x.id !== id));
    if (userId) {
      supabase.from("expenses").delete().eq("id", id).then(({ error }) => {
        if (error) queue({ kind: "delete", id });
      });
    } else {
      queue({ kind: "delete", id });
    }
  }, [userId]);

  // ---- categories (cloud-backed) ----
  const upsertCategoryRow = (c: CategoryDef) => {
    if (!userId) return;
    supabase.from("categories").upsert({
      user_id: userId, name: c.name,
      subcategories: c.subcategories,
      color: c.color ?? null, icon: c.icon ?? null,
    }, { onConflict: "user_id,name" });
  };

  const addCategory = useCallback((name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    setCategories((prev) => {
      if (prev.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) return prev;
      const next: CategoryDef = { name: trimmed, subcategories: [], custom: true };
      upsertCategoryRow(next);
      return [...prev, next];
    });
  }, [userId]);

  const renameCategory = useCallback((oldName: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed || trimmed === oldName) return;
    setCategories((prev) => prev.map((c) => (c.name === oldName ? { ...c, name: trimmed } : c)));
    setExpenses((prev) => prev.map((e) => (e.category === oldName ? { ...e, category: trimmed } : e)));
    setBudgets((prev) => {
      if (!(oldName in prev)) return prev;
      const next = { ...prev }; next[trimmed] = next[oldName]; delete next[oldName]; return next;
    });
    if (userId) {
      supabase.from("categories").update({ name: trimmed }).eq("user_id", userId).eq("name", oldName);
      supabase.from("expenses").update({ category: trimmed }).eq("user_id", userId).eq("category", oldName);
      supabase.from("budgets").update({ category: trimmed }).eq("user_id", userId).eq("category", oldName);
    }
  }, [userId]);

  const deleteCategory = useCallback((name: string) => {
    setCategories((prev) => prev.filter((c) => c.name !== name));
    setBudgets((prev) => { const n = { ...prev }; delete n[name]; return n; });
    if (userId) {
      supabase.from("categories").delete().eq("user_id", userId).eq("name", name);
      supabase.from("budgets").delete().eq("user_id", userId).eq("category", name);
    }
  }, [userId]);

  const setCategoryStyle = useCallback((name: string, patch: { color?: string; icon?: string }) => {
    setCategories((prev) => prev.map((c) => {
      if (c.name !== name) return c;
      const next = { ...c, ...patch };
      upsertCategoryRow(next);
      return next;
    }));
  }, [userId]);

  const addSubcategory = useCallback((category: string, sub: string) => {
    const s = sub.trim().toLowerCase();
    if (!s) return;
    setCategories((prev) => prev.map((c) => {
      if (c.name !== category) return c;
      if (c.subcategories.some((x) => x.toLowerCase() === s)) return c;
      const next = { ...c, subcategories: [...c.subcategories, s] };
      upsertCategoryRow(next);
      return next;
    }));
  }, [userId]);

  const deleteSubcategory = useCallback((category: string, sub: string) => {
    setCategories((prev) => prev.map((c) => {
      if (c.name !== category) return c;
      const next = { ...c, subcategories: c.subcategories.filter((x) => x !== sub) };
      upsertCategoryRow(next);
      return next;
    }));
  }, [userId]);

  const importExpenses = useCallback((rows: Omit<Expense, "id" | "created_at">[]) => {
    const now = Date.now();
    const newOnes: Expense[] = rows.map((r, i) => ({
      ...r, id: crypto.randomUUID(), created_at: new Date(now - i).toISOString(),
    }));
    setExpenses((prev) => [...newOnes, ...prev]);
    setCategories((prev) => {
      const existing = new Set(prev.map((c) => c.name.toLowerCase()));
      const adds: CategoryDef[] = [];
      rows.forEach((r) => {
        const k = r.category.trim();
        if (k && !existing.has(k.toLowerCase())) {
          existing.add(k.toLowerCase());
          const def: CategoryDef = { name: k, subcategories: [], custom: true };
          adds.push(def);
          upsertCategoryRow(def);
        }
      });
      return adds.length ? [...prev, ...adds] : prev;
    });
    if (userId) {
      const insertRows = newOnes.map((r) => ({
        id: r.id, user_id: userId, amount: r.amount, category: r.category,
        subcategory: r.subcategory ?? null, note: r.note ?? null,
        date: r.date, payment_method: r.payment_method,
      }));
      // chunk to be safe
      const chunkSize = 200;
      (async () => {
        for (let i = 0; i < insertRows.length; i += chunkSize) {
          await supabase.from("expenses").insert(insertRows.slice(i, i + chunkSize));
        }
      })();
    } else {
      newOnes.forEach((row) => queue({ kind: "insert", row }));
    }
    return newOnes.length;
  }, [userId]);

  const setBudget = useCallback((category: string, amount: number | null) => {
    setBudgets((prev) => {
      const next = { ...prev };
      if (amount === null || !amount || amount <= 0) delete next[category];
      else next[category] = amount;
      return next;
    });
    if (!userId) return;
    if (amount === null || !amount || amount <= 0) {
      supabase.from("budgets").delete().eq("user_id", userId).eq("category", category);
    } else {
      supabase.from("budgets").upsert(
        { user_id: userId, category, amount_monthly: amount },
        { onConflict: "user_id,category" }
      );
    }
  }, [userId]);

  // Backup / restore
  const exportData = useCallback(() => ({
    version: 1,
    exported_at: new Date().toISOString(),
    expenses,
    categories,
    budgets,
  }), [expenses, categories, budgets]);

  const restoreData = useCallback(async (
    data: { expenses?: Expense[]; categories?: CategoryDef[]; budgets?: Budgets },
    mode: "replace" | "merge"
  ) => {
    if (mode === "replace") {
      setExpenses(data.expenses ?? []);
      setCategories(data.categories ?? DEFAULT_CATEGORIES);
      setBudgets(data.budgets ?? {});
    } else {
      setExpenses((prev) => {
        const ids = new Set(prev.map((x) => x.id));
        const adds = (data.expenses ?? []).filter((x) => !ids.has(x.id));
        return [...adds, ...prev];
      });
      setCategories((prev) => {
        const names = new Set(prev.map((x) => x.name.toLowerCase()));
        const adds = (data.categories ?? []).filter((c) => !names.has(c.name.toLowerCase()));
        return [...prev, ...adds];
      });
      setBudgets((prev) => ({ ...prev, ...(data.budgets ?? {}) }));
    }
    if (userId) {
      if (mode === "replace") {
        await supabase.from("expenses").delete().eq("user_id", userId);
        await supabase.from("categories").delete().eq("user_id", userId);
        await supabase.from("budgets").delete().eq("user_id", userId);
      }
      // Push everything
      const exp = data.expenses ?? [];
      const expRows = exp.map((r) => ({
        id: r.id, user_id: userId, amount: r.amount, category: r.category,
        subcategory: r.subcategory ?? null, note: r.note ?? null,
        date: r.date, payment_method: r.payment_method,
      }));
      for (let i = 0; i < expRows.length; i += 200) {
        await supabase.from("expenses").upsert(expRows.slice(i, i + 200), { onConflict: "id" });
      }
      const catRows = (data.categories ?? []).map((c) => ({
        user_id: userId, name: c.name,
        subcategories: c.subcategories ?? [],
        color: c.color ?? null, icon: c.icon ?? null,
      }));
      if (catRows.length) await supabase.from("categories").upsert(catRows, { onConflict: "user_id,name" });
      const budRows = Object.entries(data.budgets ?? {}).map(([category, amount]) => ({
        user_id: userId, category, amount_monthly: amount,
      }));
      if (budRows.length) await supabase.from("budgets").upsert(budRows, { onConflict: "user_id,category" });
    }
  }, [userId]);

  return {
    expenses, categories, budgets,
    syncing, lastSync, sync,
    addExpense, updateExpense, deleteExpense,
    addCategory, renameCategory, deleteCategory, setCategoryStyle,
    addSubcategory, deleteSubcategory,
    importExpenses, setBudget,
    exportData, restoreData,
  };
}
