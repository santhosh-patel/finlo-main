import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import {
  CategoryDef,
  DEFAULT_CATEGORIES,
  Expense,
  expenseDateToDbIso,
  normalizeExpenseDate,
} from "@/lib/expenses";
import { toast } from "@/hooks/use-toast";
import { vibrate } from "@/lib/utils";
import {
  idbGetPending,
  idbSetPending,
  migrateLegacyPendingFromLocalStorage,
  type PendingOp,
} from "@/lib/pendingQueueIdb";

const EXP_KEY = "finlo.expenses.v1";
const CAT_KEY = "finlo.categories.v1";
const BUD_KEY = "finlo.budgets.v1";
const LAST_SYNC_KEY = "finlo.last_sync.v1";

export type Budgets = Record<string, number>;
export type { PendingOp };

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
  } catch (e) {
    console.warn(`localStorage setItem failed (${key})`, e);
  }
}

function formatSupabaseErr(err: unknown): string {
  if (err && typeof err === "object") {
    const o = err as { message?: string; details?: string; hint?: string };
    const parts = [o.message, o.details, o.hint].filter((x): x is string => typeof x === "string" && x.length > 0);
    if (parts.length) return parts.join(" — ");
  }
  if (err instanceof Error) return err.message;
  return String(err);
}

interface DBExpenseRow {
  id: string;
  amount: number;
  category: string;
  subcategory: string | null;
  note: string | null;
  date: string;
  payment_method: string | null;
  created_at: string;
  type: string | null;
  currency: string | null;
  fx_rate: number | null;
  base_amount: number | null;
  is_reimbursable: boolean | null;
  import_hash: string | null;
  receipt_url: string | null;
  split_note: string | null;
  reimbursed_at: string | null;
  client_updated_at: string | null;
  user_id: string;
  household_id: string | null;
  reactions: { user_id: string; emoji: string }[] | null;
}

function normalizeExpense<T extends Expense>(expense: T): T {
  return { ...expense, date: normalizeExpenseDate(expense.date) };
}

function normalizeExpenses(expenses: Expense[]): Expense[] {
  return expenses.map(normalizeExpense);
}

export function useExpenses(userId: string | null, householdId?: string | null) {
  const expKey = userId ? `finlo.expenses.${userId}.v1` : EXP_KEY;
  const catKey = userId ? `finlo.categories.${userId}.v1` : CAT_KEY;
  const budKey = userId ? `finlo.budgets.${userId}.v1` : BUD_KEY;
  const lastSyncKey = userId ? `finlo.last_sync.${userId}.v1` : LAST_SYNC_KEY;

  const [viewMode, setViewMode] = useState<"personal" | "household">(() => {
    return (localStorage.getItem("finlo_view_mode") as "personal" | "household") || "household";
  });
  const [expenses, setExpenses] = useState<Expense[]>(() =>
    normalizeExpenses(readJSON<Expense[]>(expKey, []))
  );
  const [categories, setCategories] = useState<CategoryDef[]>(() =>
    readJSON<CategoryDef[]>(catKey, DEFAULT_CATEGORIES)
  );
  const [budgets, setBudgets] = useState<Budgets>(() => readJSON<Budgets>(budKey, {}));
  const [syncing, setSyncing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [lastSync, setLastSync] = useState<string | null>(
    () => localStorage.getItem(lastSyncKey)
  );
  const [pendingCount, setPendingCount] = useState(0);
  const [pendingHydrated, setPendingHydrated] = useState(false);
  const [initialDataReady, setInitialDataReady] = useState(false);
  const pendingRef = useRef<PendingOp[]>([]);
  const expensesRef = useRef<Expense[]>([]);

  const syncInFlightRef = useRef(false);
  const didInitialSyncRef = useRef<string | null>(null);
  const skipNextRealtimePullRef = useRef(false);

  // Dynamic state hydration on login/logout/impersonation session switch
  useEffect(() => {
    setExpenses(normalizeExpenses(readJSON<Expense[]>(expKey, [])));
    setCategories(readJSON<CategoryDef[]>(catKey, DEFAULT_CATEGORIES));
    setBudgets(readJSON<Budgets>(budKey, {}));
    setLastSync(localStorage.getItem(lastSyncKey));
  }, [userId, householdId, expKey, catKey, budKey, lastSyncKey]);

  // Keep references updated
  useEffect(() => {
    expensesRef.current = expenses;
  }, [expenses]);

  // Dynamic writing back to user-scoped storage
  useEffect(() => {
    writeJSON(expKey, expenses);
  }, [expenses, expKey]);

  useEffect(() => {
    writeJSON(catKey, categories);
  }, [categories, catKey]);

  useEffect(() => {
    writeJSON(budKey, budgets);
  }, [budgets, budKey]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      let ops = await idbGetPending();
      if (ops.length === 0) {
        const legacy = migrateLegacyPendingFromLocalStorage();
        if (legacy.length) {
          ops = legacy;
          await idbSetPending(ops);
        }
      }
      if (cancelled) return;
      pendingRef.current = ops;
      setPendingCount(ops.length);
      setPendingHydrated(true);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const queue = (op: PendingOp) => {
    pendingRef.current.push(op);
    void idbSetPending(pendingRef.current);
    setPendingCount(pendingRef.current.length);
  };

  const dequeue = (id: string) => {
    pendingRef.current = pendingRef.current.filter(
      (op) =>
        !(
          (op.kind === "insert" && op.row.id === id) ||
          (op.kind === "update" && op.id === id) ||
          (op.kind === "delete" && op.id === id)
        )
    );
    void idbSetPending(pendingRef.current);
    setPendingCount(pendingRef.current.length);
  };

  const setViewModeWithPersistence = useCallback((mode: "personal" | "household") => {
    setViewMode(mode);
    localStorage.setItem("finlo_view_mode", mode);
  }, []);

  const flushPending = useCallback(async () => {
    if (!userId || !navigator.onLine) return;
    const ops = [...pendingRef.current];
    if (ops.length === 0) return null;

    const remaining: PendingOp[] = [];
    let lastError: any = null;
    for (const op of ops) {
      try {
        if (op.kind === "insert") {
          const { error } = await supabase.from("expenses").insert({
            id: op.row.id,
            user_id: userId,
            amount: op.row.amount,
            category: op.row.category,
            subcategory: op.row.subcategory ?? null,
            note: op.row.note ?? null,
            date: expenseDateToDbIso(op.row.date),
            payment_method: op.row.payment_method,
            type: op.row.type ?? "expense",
            currency: op.row.currency ?? "INR",
            fx_rate: op.row.fx_rate ?? 1,
            base_amount: op.row.base_amount ?? op.row.amount * (op.row.fx_rate ?? 1),
            is_reimbursable: op.row.is_reimbursable ?? false,
            split_note: op.row.split_note ?? null,
            receipt_url: op.row.receipt_url ?? null,
          });
          if (error) { remaining.push(op); lastError = error; }
        } else if (op.kind === "update") {
          const { error } = await supabase.from("expenses").update({
            ...(op.patch.amount !== undefined && { amount: op.patch.amount }),
            ...(op.patch.category !== undefined && { category: op.patch.category }),
            ...(op.patch.subcategory !== undefined && { subcategory: op.patch.subcategory ?? null }),
            ...(op.patch.note !== undefined && { note: op.patch.note ?? null }),
            ...(op.patch.date !== undefined && { date: expenseDateToDbIso(op.patch.date) }),
            ...(op.patch.payment_method !== undefined && { payment_method: op.patch.payment_method }),
            ...(op.patch.type !== undefined && { type: op.patch.type }),
            ...(op.patch.currency !== undefined && { currency: op.patch.currency }),
            ...(op.patch.fx_rate !== undefined && { fx_rate: op.patch.fx_rate }),
            ...(op.patch.base_amount !== undefined && { base_amount: op.patch.base_amount }),
            ...(op.patch.is_reimbursable !== undefined && { is_reimbursable: op.patch.is_reimbursable }),
            ...(op.patch.split_note !== undefined && { split_note: op.patch.split_note ?? null }),
            ...(op.patch.receipt_url !== undefined && { receipt_url: op.patch.receipt_url ?? null }),
          }).eq("id", op.id);
          if (error) { remaining.push(op); lastError = error; }
        } else if (op.kind === "delete") {
          const { error } = await supabase
            .from("expenses")
            .update({ deleted_at: new Date().toISOString() })
            .eq("id", op.id);
          if (error) { remaining.push(op); lastError = error; }
        }
      } catch (err) {
        remaining.push(op);
        lastError = err;
      }
    }
    pendingRef.current = remaining;
    void idbSetPending(remaining);
    setPendingCount(remaining.length);
    return lastError;
  }, [userId]);

  const pullFromServer = useCallback(async () => {
    if (!userId) return;
    
    // Determine filter: If mode is personal, only own data. 
    // If mode is household and we have a household, show shared data.
    const useHouseholdQuery = viewMode === "household" && householdId;

    const expQuery = useHouseholdQuery 
      ? supabase.from("expenses").select("*").eq("household_id", householdId)
      : supabase.from("expenses").select("*").eq("user_id", userId);
    
    const catQuery = useHouseholdQuery
      ? supabase.from("categories").select("*").eq("household_id", householdId)
      : supabase.from("categories").select("*").eq("user_id", userId);

    const budQuery = useHouseholdQuery
      ? supabase.from("budgets").select("*").eq("household_id", householdId)
      : supabase.from("budgets").select("*").eq("user_id", userId);

    const [{ data: exp }, { data: cat }, { data: bud }] = await Promise.all([
      expQuery.is("deleted_at", null).order("date", { ascending: false }).order("created_at", { ascending: false }),
      catQuery,
      budQuery,
    ]);
    if (exp) {
      const serverExpenses = (exp as unknown as DBExpenseRow[]).map((r) => ({
        id: r.id,
        amount: Number(r.amount),
        category: r.category,
        subcategory: r.subcategory ?? undefined,
        note: r.note ?? undefined,
        date: normalizeExpenseDate(r.date),
        payment_method: (r.payment_method as Expense["payment_method"]) ?? "upi",
        created_at: r.created_at,
        type: (r.type as Expense["type"]) ?? "expense",
        currency: r.currency ?? "INR",
        fx_rate: r.fx_rate != null ? Number(r.fx_rate) : 1,
        base_amount: r.base_amount != null ? Number(r.base_amount) : undefined,
        is_reimbursable: !!r.is_reimbursable,
        import_hash: r.import_hash ?? undefined,
        receipt_url: r.receipt_url ?? undefined,
        split_note: r.split_note ?? undefined,
        reimbursed_at: r.reimbursed_at ?? null,
        client_updated_at: r.client_updated_at ?? undefined,
        user_id: r.user_id,
        household_id: r.household_id,
        reactions: r.reactions || [],
      }));

      // Merge offline additions that have not synced yet
      const pendingInserts = pendingRef.current
        .filter((op): op is PendingOp & { kind: "insert" } => op.kind === "insert")
        .map((op) => op.row)
        .filter((row) => !serverExpenses.some((se) => se.id === row.id));

      // Retrieve offline deletions
      const pendingDeletes = new Set(
        pendingRef.current
          .filter((op): op is PendingOp & { kind: "delete" } => op.kind === "delete")
          .map((op) => op.id)
      );

      // Retrieve offline updates map
      const pendingUpdates = new Map<string, Partial<Expense>>();
      pendingRef.current
        .filter((op): op is PendingOp & { kind: "update" } => op.kind === "update")
        .forEach((op) => {
          pendingUpdates.set(op.id, op.patch);
        });

      // Filter and map offline-edited states
      let mergedExpenses = [...pendingInserts, ...serverExpenses]
        .filter((e) => !pendingDeletes.has(e.id))
        .map((e) => {
          const patch = pendingUpdates.get(e.id);
          if (patch) {
            return { ...e, ...patch };
          }
          return e;
        });

      // Maintain proper sorting order
      mergedExpenses.sort((a, b) => {
        const dateCompare = b.date.localeCompare(a.date);
        if (dateCompare !== 0) return dateCompare;
        return b.created_at.localeCompare(a.created_at);
      });

      setExpenses(mergedExpenses);
    }
    if (cat) {
      const serverCats = cat.map((c) => ({
        name: c.name,
        subcategories: c.subcategories ?? [],
        color: c.color ?? undefined,
        icon: c.icon ?? undefined,
        custom: true,
      }));

      // Merge defaults with server categories, preferring server data for matches
      const merged = [...DEFAULT_CATEGORIES];
      serverCats.forEach((sc) => {
        const idx = merged.findIndex((m) => m.name.toLowerCase() === sc.name.toLowerCase());
        if (idx !== -1) merged[idx] = { ...merged[idx], ...sc };
        else merged.push(sc);
      });
      setCategories(merged);

      if (cat.length === 0 && userId) {
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
    }
    if (bud) {
      const m: Budgets = {};
      bud.forEach((b) => { m[b.category] = Number(b.amount_monthly); });
      setBudgets(m);
    }
    const ts = new Date().toISOString();
    setLastSync(ts);
    localStorage.setItem(lastSyncKey, ts);
  }, [userId, lastSyncKey]);

  /** Full sync (default). Pass `{ skipIfNoPending: true }` for pull-to-refresh: no network if the offline queue is empty. `silentToast` skips the success toast (e.g. pull-to-refresh). Returns whether a sync ran. */
  const sync = useCallback(async (opts?: { skipIfNoPending?: boolean; silentToast?: boolean }) => {
    if (!userId) return false;
    if (syncInFlightRef.current) return false;
    const hadPending = pendingRef.current.length > 0;
    if (opts?.skipIfNoPending && !hadPending) {
      return false;
    }
    syncInFlightRef.current = true;
    setSyncing(true);
    try {
      const flushError = await flushPending();
      const stillPending = pendingRef.current.length > 0;
      skipNextRealtimePullRef.current = true;
      await pullFromServer();
      if (stillPending) {
        let msg = "Check your connection, then tap Sync again.";
        if (flushError) {
          msg = typeof flushError === 'object' && flushError !== null && 'message' in flushError 
            ? `Sync failed: ${flushError.message}` 
            : `Sync failed: ${JSON.stringify(flushError)}`;
        }
        toast({
          title: "Could not save all changes",
          description: msg,
          variant: "destructive",
        });
      } else if (!opts?.silentToast) {
        toast({ title: "Synced", description: "All changes are up to date." });
      }
      return true;
    } catch (e) {
      console.error(e);
      toast({ title: "Sync failed", description: String(e), variant: "destructive" });
      return false;
    } finally {
      syncInFlightRef.current = false;
      setSyncing(false);
    }
  }, [userId, flushPending, pullFromServer]);

  const syncRef = useRef(sync);
  syncRef.current = sync;

  // Reconcile with the server when the user comes back to the tab so every client
  // (localhost, prod, phone) that shares the same Supabase project + account converges quickly.
  useEffect(() => {
    if (!userId) return;
    let lastPullAt = 0;
    const throttleMs = 45_000;

    const maybeRefresh = () => {
      if (!navigator.onLine) return;
      if (document.visibilityState !== "visible") return;
      const now = Date.now();
      if (now - lastPullAt < throttleMs) return;
      lastPullAt = now;
      void syncRef.current({ silentToast: true });
    };

    document.addEventListener("visibilitychange", maybeRefresh);
    window.addEventListener("focus", maybeRefresh);
    return () => {
      document.removeEventListener("visibilitychange", maybeRefresh);
      window.removeEventListener("focus", maybeRefresh);
    };
  }, [userId]);

  // Initial sync + realtime
  useEffect(() => {
    if (!userId) {
      didInitialSyncRef.current = null;
      setInitialDataReady(false);
      return;
    }
    if (!pendingHydrated) return;
    if (didInitialSyncRef.current === userId) return;
    didInitialSyncRef.current = userId;
    let cancelled = false;

    const hasLocalExpenses = expensesRef.current.length > 0;
    const hasPendingChanges = pendingRef.current.length > 0;
    const bootstrap = async () => {
      try {
        if (navigator.onLine) {
          await flushPending();
          await pullFromServer();
        } else {
          if (hasPendingChanges) {
            await flushPending();
          }
        }
      } catch (err) {
        console.error("Bootstrap sync failed:", err);
      } finally {
        if (!cancelled) setInitialDataReady(true);
      }
    };
    void bootstrap();
    const realtimeFilter = householdId
      ? `household_id=eq.${householdId}`
      : `user_id=eq.${userId}`;
    const ch = supabase
      .channel(`expenses-${userId}-${householdId ?? "solo"}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "expenses", filter: realtimeFilter },
        (payload) => {
          if (skipNextRealtimePullRef.current) {
            skipNextRealtimePullRef.current = false;
            return;
          }
          const eventType = payload.eventType;
          if (eventType === "INSERT") {
            const row = payload.new;
            setExpenses((prev) => {
              if (prev.some((e) => e.id === row.id)) return prev;
              const mapped: Expense = {
                id: row.id,
                amount: Number(row.amount),
                category: row.category,
                subcategory: row.subcategory ?? undefined,
                note: row.note ?? undefined,
                date: normalizeExpenseDate(row.date),
                payment_method: (row.payment_method as Expense["payment_method"]) ?? "upi",
                created_at: row.created_at,
                type: (row.type as Expense["type"]) ?? "expense",
                currency: row.currency ?? "INR",
                fx_rate: row.fx_rate != null ? Number(row.fx_rate) : 1,
                base_amount: row.base_amount != null ? Number(row.base_amount) : undefined,
                is_reimbursable: !!row.is_reimbursable,
                reimbursed_at: row.reimbursed_at ?? null,
                client_updated_at: row.client_updated_at ?? undefined,
                split_note: row.split_note ?? undefined,
                receipt_url: row.receipt_url ?? undefined,
                user_id: row.user_id,
                household_id: row.household_id,
                reactions: row.reactions || [],
              };
              return [mapped, ...prev].sort((a, b) => b.date.localeCompare(a.date));
            });
          } else if (eventType === "UPDATE") {
            const row = payload.new;
            setExpenses((prev) => prev.map((e) => {
              if (e.id !== row.id) return e;
              return {
                ...e,
                amount: Number(row.amount),
                category: row.category,
                subcategory: row.subcategory ?? undefined,
                note: row.note ?? undefined,
                date: normalizeExpenseDate(row.date),
                payment_method: (row.payment_method as Expense["payment_method"]) ?? "upi",
                type: (row.type as Expense["type"]) ?? "expense",
                currency: row.currency ?? "INR",
                fx_rate: row.fx_rate != null ? Number(row.fx_rate) : 1,
                base_amount: row.base_amount != null ? Number(row.base_amount) : undefined,
                is_reimbursable: !!row.is_reimbursable,
                reimbursed_at: row.reimbursed_at ?? null,
                client_updated_at: row.client_updated_at ?? undefined,
                split_note: row.split_note ?? undefined,
                receipt_url: row.receipt_url ?? undefined,
                user_id: row.user_id,
                household_id: row.household_id,
                reactions: row.reactions || [],
              };
            }));
          } else if (eventType === "DELETE") {
            const oldId = payload.old.id;
            setExpenses((prev) => prev.filter((e) => e.id !== oldId));
          }
        },
      )
      .subscribe();
    const onOnline = () => { if (!cancelled) void syncRef.current(); };
    window.addEventListener("online", onOnline);
    return () => {
      cancelled = true;
      supabase.removeChannel(ch);
      window.removeEventListener("online", onOnline);
    };
  }, [userId, householdId, pullFromServer, flushPending, pendingHydrated]);

  // ------- mutators (optimistic local + queue/server) -------
  const addExpense = useCallback((e: Omit<Expense, "id" | "created_at">) => {
    const fx = e.fx_rate ?? 1;
    const newE: Expense = {
      ...e,
      date: normalizeExpenseDate(e.date),
      fx_rate: fx,
      base_amount: e.base_amount ?? Number(e.amount) * fx,
      id: crypto.randomUUID(),
      created_at: new Date().toISOString(),
      user_id: e.user_id || userId || "",
      reactions: e.reactions ?? [],
    };
    setExpenses((prev) => [newE, ...prev]);

    // Queue first so the expense survives a page close/reload before the
    // direct insert completes. Dequeue on success.
    queue({ kind: "insert", row: newE });

    if (userId && navigator.onLine) {
      (async () => {
        try {
          const { error } = await supabase.from("expenses").insert({
            id: newE.id, user_id: userId, amount: newE.amount, category: newE.category,
            subcategory: newE.subcategory ?? null, note: newE.note ?? null,
            date: expenseDateToDbIso(newE.date), payment_method: newE.payment_method,
            type: newE.type ?? "expense",
            currency: newE.currency ?? "INR",
            fx_rate: fx,
            base_amount: newE.base_amount ?? Number(newE.amount) * fx,
            is_reimbursable: newE.is_reimbursable ?? false,
            split_note: newE.split_note ?? null,
            receipt_url: newE.receipt_url ?? null,
          });

          if (!error) {
            dequeue(newE.id);
            if (newE.category.toLowerCase() === "lending") {
              const counterparty = newE.note?.trim() || "Someone";
              const direction = newE.type === "income" ? "borrowed" : "lent";
              try {
                const { error: loanErr } = await supabase.from("loans").insert({
                  user_id: userId,
                  counterparty,
                  amount: newE.amount,
                  direction,
                  date: newE.date,
                  note: newE.note ? `Auto-created from transaction: ${newE.note}` : "Auto-created from transaction",
                  expense_id: newE.id,
                  status: "open",
                });
                if (loanErr) console.error("Failed to auto-create loan:", loanErr);
                else {
                  toast({ title: "Loan tracker updated", description: `Added ${direction === "lent" ? "lent to" : "borrowed from"} ${counterparty}.` });
                }
              } catch (lErr) {
                console.error("Failed to auto-create loan due to exception:", lErr);
              }
            }
          } else {
            console.error("Failed to insert expense:", error);
            toast({
              title: "Could not save transaction",
              description: formatSupabaseErr(error),
              variant: "destructive",
            });
          }
        } catch (err) {
          console.error("Exception during expense insert:", err);
          toast({
            title: "Could not save transaction",
            description: formatSupabaseErr(err),
            variant: "destructive",
          });
        } finally {
          vibrate([28, 42, 28]);
        }
      })();
    } else {
      vibrate([28, 42, 28]);
    }
    return newE;
  }, [userId]);

  const showConflictToast = useCallback((id: string, patch: Partial<Expense>, serverRow: Record<string, unknown>) => {
    toast({
      title: "Sync Conflict Detected",
      description: `Transaction "${serverRow.note || serverRow.category}" has a newer update on the server.`,
      variant: "destructive",
      action: (
        <div className="flex gap-2">
          <button
            onClick={async () => {
              const forcedTime = new Date().toISOString();
              await supabase.from("expenses").update({
                ...patch,
                ...(patch.date !== undefined ? { date: expenseDateToDbIso(patch.date) } : {}),
                client_updated_at: forcedTime,
              }).eq("id", id);
              setExpenses((prev) => prev.map((e) => e.id === id ? { ...e, ...patch, client_updated_at: forcedTime } : e));
              toast({ title: "Resolved: Kept Your Changes" });
            }}
            className="bg-background text-foreground text-[10px] px-2.5 py-1.5 rounded-full font-semibold shadow hover:bg-background/90 shrink-0"
          >
            Keep Mine
          </button>
          <button
            onClick={() => {
              setExpenses((prev) => prev.map((e) => e.id === id ? {
                ...e,
                amount: Number(serverRow.amount),
                category: String(serverRow.category),
                subcategory: (serverRow.subcategory as string) ?? undefined,
                note: (serverRow.note as string) ?? undefined,
                date: normalizeExpenseDate(String(serverRow.date)),
                payment_method: (serverRow.payment_method as Expense["payment_method"]) ?? "upi",
                type: (serverRow.type as Expense["type"]) ?? "expense",
                currency: (serverRow.currency as string) ?? "INR",
                fx_rate: serverRow.fx_rate != null ? Number(serverRow.fx_rate) : 1,
                base_amount: serverRow.base_amount != null ? Number(serverRow.base_amount) : undefined,
                is_reimbursable: !!serverRow.is_reimbursable,
                reimbursed_at: (serverRow.reimbursed_at as string) ?? null,
                client_updated_at: (serverRow.client_updated_at as string) ?? undefined,
                receipt_url: (serverRow.receipt_url as string) ?? undefined,
                split_note: (serverRow.split_note as string) ?? undefined,
              } : e));
              toast({ title: "Resolved: Accepted Server Version" });
            }}
            className="bg-foreground text-background text-[10px] px-2.5 py-1.5 rounded-full font-semibold shadow hover:bg-background/90 shrink-0"
          >
            Accept Theirs
          </button>
        </div>
      ),
    });
  }, [setExpenses]);

  const updateExpense = useCallback(async (id: string, patch: Partial<Omit<Expense, "id" | "created_at">>) => {
    const clientUpdatedAt = new Date().toISOString();
    const normalizedPatch = {
      ...patch,
      ...(patch.date !== undefined ? { date: normalizeExpenseDate(patch.date) } : {}),
    };
    let localRow: Expense | undefined;

    setExpenses((prev) => {
      localRow = prev.find((e) => e.id === id);
      return prev.map((x) => {
        if (x.id !== id) return x;
        const merged = { ...x, ...normalizedPatch, client_updated_at: clientUpdatedAt };
        const fx = merged.fx_rate ?? 1;
        merged.fx_rate = fx;
        merged.base_amount = Number(merged.amount) * fx;
        return merged;
      });
    });

    queue({ kind: "update", id, patch: { ...normalizedPatch, client_updated_at: clientUpdatedAt } });

    if (userId && navigator.onLine) {
      try {
        const { data: serverRow } = await supabase
          .from("expenses")
          .select("*")
          .eq("id", id)
          .maybeSingle();

        // Only compare when we know the client's last write time. If local state
        // never had client_updated_at (e.g. cached before we mapped it from the
        // server), treating server > 0 would falsely block every update.
        if (
          serverRow?.client_updated_at &&
          localRow?.client_updated_at
        ) {
          const serverTime = new Date(serverRow.client_updated_at).getTime();
          const localLastTime = new Date(localRow.client_updated_at).getTime();

          if (serverTime > localLastTime) {
            dequeue(id);
            showConflictToast(id, normalizedPatch, serverRow);
            return;
          }
        }

        const { error } = await supabase.from("expenses").update({
          ...(normalizedPatch.amount !== undefined && { amount: normalizedPatch.amount }),
          ...(normalizedPatch.category !== undefined && { category: normalizedPatch.category }),
          ...(normalizedPatch.subcategory !== undefined && { subcategory: normalizedPatch.subcategory ?? null }),
          ...(normalizedPatch.note !== undefined && { note: normalizedPatch.note ?? null }),
          ...(normalizedPatch.date !== undefined && { date: expenseDateToDbIso(normalizedPatch.date) }),
          ...(normalizedPatch.payment_method !== undefined && { payment_method: normalizedPatch.payment_method }),
          ...(normalizedPatch.type !== undefined && { type: normalizedPatch.type }),
          ...(normalizedPatch.currency !== undefined && { currency: normalizedPatch.currency }),
          ...(normalizedPatch.fx_rate !== undefined && { fx_rate: normalizedPatch.fx_rate }),
          ...(normalizedPatch.is_reimbursable !== undefined && { is_reimbursable: normalizedPatch.is_reimbursable }),
          ...(normalizedPatch.split_note !== undefined && { split_note: normalizedPatch.split_note ?? null }),
          ...(normalizedPatch.receipt_url !== undefined && { receipt_url: normalizedPatch.receipt_url ?? null }),
          client_updated_at: clientUpdatedAt,
        }).eq("id", id);

        if (!error) {
          dequeue(id);
        } else {
          console.error("Failed to update expense:", error);
          toast({
            title: "Could not update transaction",
            description: formatSupabaseErr(error),
            variant: "destructive",
          });
        }
      } catch (err) {
        console.error("Exception during expense update:", err);
        toast({
          title: "Could not update transaction",
          description: formatSupabaseErr(err),
          variant: "destructive",
        });
      }
    }
  }, [userId, showConflictToast]);

  const deleteExpense = useCallback((id: string) => {
    setExpenses((prev) => prev.filter((x) => x.id !== id));

    queue({ kind: "delete", id });

    if (userId && navigator.onLine) {
      (async () => {
        try {
          const { error } = await supabase.from("expenses").update({ deleted_at: new Date().toISOString() }).eq("id", id);
          if (!error) {
            dequeue(id);
          } else {
            console.error("Failed to soft-delete expense:", error);
            toast({
              title: "Could not delete transaction",
              description: formatSupabaseErr(error),
              variant: "destructive",
            });
          }
        } catch (err) {
          console.error("Exception during expense delete:", err);
          toast({
            title: "Could not delete transaction",
            description: formatSupabaseErr(err),
            variant: "destructive",
          });
        }
      })();
    }
  }, [userId]);

  const toggleReaction = useCallback(async (id: string, emoji: string) => {
    if (!userId) return;
    setExpenses((prev) => prev.map((e) => {
      if (e.id !== id) return e;
      const reactions = e.reactions || [];
      const existingIdx = reactions.findIndex((r) => r.user_id === userId && r.emoji === emoji);
      let nextReactions = [...reactions];
      if (existingIdx !== -1) {
        nextReactions.splice(existingIdx, 1);
      } else {
        nextReactions.push({ user_id: userId, emoji });
      }
      return { ...e, reactions: nextReactions };
    }));

    // Optimistically update DB
    const { data: current } = await supabase.from("expenses").select("reactions").eq("id", id).single();
    if (current) {
      const reactions = (current.reactions as any[]) || [];
      const existingIdx = reactions.findIndex((r) => r.user_id === userId && r.emoji === emoji);
      let nextReactions = [...reactions];
      if (existingIdx !== -1) {
        nextReactions.splice(existingIdx, 1);
      } else {
        nextReactions.push({ user_id: userId, emoji });
      }
      await supabase.from("expenses").update({ reactions: nextReactions }).eq("id", id);
    }
  }, [userId]);

  // ---- categories (cloud-backed) ----
  const upsertCategoryRow = useCallback(async (c: CategoryDef) => {
    if (!userId) return;
    const useHousehold = viewMode === "household" && householdId;
    
    const { error } = await supabase.from("categories").upsert({
      user_id: useHousehold ? null : userId,
      household_id: useHousehold ? householdId : null,
      name: c.name,
      subcategories: c.subcategories,
      color: c.color ?? null,
      icon: c.icon ?? null,
    }, { onConflict: useHousehold ? "household_id,name" : "user_id,name" });
    
    if (error) {
      console.error("Failed to sync category:", error);
      toast({ title: "Sync Error", description: `Couldn't save category "${c.name}" to cloud.`, variant: "destructive" });
    }
  }, [userId, householdId, viewMode]);

  const addCategory = useCallback((name: string, opts?: { subcategories?: string[]; type?: CategoryDef["type"]; silentToast?: boolean }) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const subs = opts?.subcategories?.map((s) => s.trim().toLowerCase()).filter(Boolean) ?? [];
    setCategories((prev) => {
      if (prev.some((c) => c.name.toLowerCase() === trimmed.toLowerCase())) return prev;
      const next: CategoryDef = {
        name: trimmed,
        subcategories: subs,
        custom: true,
        ...(opts?.type ? { type: opts.type } : {}),
      };
      upsertCategoryRow(next).then(() => {
        if (!opts?.silentToast) toast({ title: "Category added", description: `"${trimmed}" is now available.` });
      });
      return [...prev, next];
    });
  }, [upsertCategoryRow]);

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
      const useHousehold = viewMode === "household" && householdId;
      const filterField = useHousehold ? "household_id" : "user_id";
      const filterValue = useHousehold ? householdId : userId;

      supabase.from("categories").update({ name: trimmed }).eq(filterField, filterValue).eq("name", oldName);
      supabase.from("expenses").update({ category: trimmed }).eq(filterField, filterValue).eq("category", oldName);
      supabase.from("budgets").update({ category: trimmed }).eq(filterField, filterValue).eq("category", oldName);
    }
  }, [userId, householdId, viewMode]);

  const deleteCategory = useCallback((name: string, strategy: "delete" | "move" = "move", targetCategory: string = "Misc") => {
    setCategories((prev) => prev.filter((c) => c.name !== name));
    setBudgets((prev) => { const n = { ...prev }; delete n[name]; return n; });
    
    if (strategy === "delete") {
      setExpenses((prev) => prev.filter((e) => e.category !== name));
    } else {
      setExpenses((prev) => prev.map((e) => (e.category === name ? { ...e, category: targetCategory } : e)));
    }
 
    if (userId) {
      const useHousehold = viewMode === "household" && householdId;
      const filterField = useHousehold ? "household_id" : "user_id";
      const filterValue = useHousehold ? householdId : userId;

      supabase.from("categories").delete().eq(filterField, filterValue).eq("name", name);
      supabase.from("budgets").delete().eq(filterField, filterValue).eq("category", name);
      
      if (strategy === "delete") {
        supabase.from("expenses").delete().eq(filterField, filterValue).eq("category", name);
      } else {
        supabase.from("expenses").update({ category: targetCategory }).eq(filterField, filterValue).eq("category", name);
      }
    }
  }, [userId, householdId, viewMode]);

  const setCategoryStyle = useCallback((name: string, patch: { color?: string; icon?: string }) => {
    setCategories((prev) => prev.map((c) => {
      if (c.name !== name) return c;
      const next = { ...c, ...patch };
      upsertCategoryRow(next);
      return next;
    }));
  }, [upsertCategoryRow]);

  const addSubcategory = useCallback((category: string, sub: string) => {
    const s = sub.trim().toLowerCase();
    if (!s) return;
    setCategories((prev) => prev.map((c) => {
      if (c.name !== category) return c;
      if (c.subcategories.some((x) => x.toLowerCase() === s)) return c;
      const next = { ...c, subcategories: [...c.subcategories, s] };
      upsertCategoryRow(next).then(() => {
        toast({ title: "Subcategory added", description: `"${s}" added to ${category}.` });
      });
      return next;
    }));
  }, [upsertCategoryRow]);

  const deleteSubcategory = useCallback((category: string, sub: string) => {
    setCategories((prev) => prev.map((c) => {
      if (c.name !== category) return c;
      const next = { ...c, subcategories: c.subcategories.filter((x) => x !== sub) };
      upsertCategoryRow(next);
      return next;
    }));
  }, [upsertCategoryRow]);

  const importExpenses = useCallback((rows: Omit<Expense, "id" | "created_at">[]) => {
    const existingHashes = new Set(expenses.map((e) => e.import_hash).filter(Boolean));
    const toImport: Expense[] = [];
    let skippedDuplicates = 0;

    const now = Date.now();
    rows.forEach((r, i) => {
      if (r.import_hash && existingHashes.has(r.import_hash)) {
        skippedDuplicates++;
        return;
      }
      if (r.import_hash) {
        existingHashes.add(r.import_hash);
      }
      toImport.push({
        ...r,
        date: normalizeExpenseDate(r.date),
        id: crypto.randomUUID(),
        created_at: new Date(now - i).toISOString(),
      });
    });

    if (toImport.length === 0) {
      return { imported: 0, skippedDuplicates };
    }

    setExpenses((prev) => [...toImport, ...prev]);
    setCategories((prev) => {
      const existing = new Set(prev.map((c) => c.name.toLowerCase()));
      const adds: CategoryDef[] = [];
      toImport.forEach((r) => {
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
      const insertRows = toImport.map((r) => ({
        id: r.id,
        user_id: userId,
        amount: r.amount,
        category: r.category,
        subcategory: r.subcategory ?? null,
        note: r.note ?? null,
        date: expenseDateToDbIso(r.date),
        payment_method: r.payment_method,
        import_hash: r.import_hash ?? null,
      }));
      const chunkSize = 200;
      (async () => {
        for (let i = 0; i < insertRows.length; i += chunkSize) {
          await supabase.from("expenses").insert(insertRows.slice(i, i + chunkSize));
        }
      })();
    } else {
      toImport.forEach((row) => queue({ kind: "insert", row }));
    }

    return { imported: toImport.length, skippedDuplicates };
  }, [userId, expenses, upsertCategoryRow]);

  const setBudget = useCallback((category: string, amount: number | null) => {
    setBudgets((prev) => {
      const next = { ...prev };
      if (amount === null) delete next[category];
      else next[category] = amount;
      return next;
    });
    if (userId) {
      const useHousehold = viewMode === "household" && householdId;
      if (amount === null) {
        supabase.from("budgets").delete()
          .eq(useHousehold ? "household_id" : "user_id", useHousehold ? householdId : userId)
          .eq("category", category);
      } else {
        supabase.from("budgets").upsert({
          user_id: useHousehold ? null : userId,
          household_id: useHousehold ? householdId : null,
          category,
          amount_monthly: amount,
        }, { onConflict: useHousehold ? "household_id,category" : "user_id,category" });
      }
    }
  }, [userId, householdId, viewMode]);

  // Backup / restore
  const exportData = useCallback(() => ({
    version: 1,
    exported_at: new Date().toISOString(),
    expenses,
    loading,
    viewMode,
    setViewMode: setViewModeWithPersistence,
    categories,
    budgets,
  }), [expenses, categories, budgets]);

  const restoreData = useCallback(async (
    data: { expenses?: Expense[]; categories?: CategoryDef[]; budgets?: Budgets },
    mode: "replace" | "merge"
  ) => {
    if (mode === "replace") {
      setExpenses(normalizeExpenses(data.expenses ?? []));
      setCategories(data.categories ?? DEFAULT_CATEGORIES);
      setBudgets(data.budgets ?? {});
    } else {
      setExpenses((prev) => {
        const ids = new Set(prev.map((x) => x.id));
        const adds = normalizeExpenses(data.expenses ?? []).filter((x) => !ids.has(x.id));
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
        date: expenseDateToDbIso(r.date), payment_method: r.payment_method,
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
    loading,
    viewMode, setViewMode: setViewModeWithPersistence,
    initialDataReady,
    pendingCount,
    addExpense, updateExpense, deleteExpense,
    addCategory, renameCategory, deleteCategory, setCategoryStyle,
    addSubcategory, deleteSubcategory,
    importExpenses, setBudget,
    exportData, restoreData,
    toggleReaction,
  };
}
