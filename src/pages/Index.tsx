import { useEffect, useMemo, useState } from "react";
import { Plus, LogOut, Search } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddExpenseSheet } from "@/components/AddExpenseSheet";
import { ExpenseRow } from "@/components/ExpenseRow";
import { WeeklyView } from "@/components/WeeklyView";
import { MonthlyView } from "@/components/MonthlyView";
import { FilterState } from "@/components/SearchFilters";
import { SearchOverlay } from "@/components/SearchOverlay";
import { ExpenseDetailsDrawer } from "@/components/ExpenseDetailsDrawer";
import { BudgetsSheet } from "@/components/BudgetsSheet";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import Login from "@/pages/Login";
import { useExpenses } from "@/hooks/useExpenses";
import { useAuth } from "@/hooks/useAuth";
import { Expense, formatINR, fullDateLabel, startOfMonthISO, todayISO } from "@/lib/expenses";
import { cn } from "@/lib/utils";

type View = "today" | "week" | "month";

const FILTERS_KEY = "ledger.filters.v1";
const EMPTY_FILTERS: FilterState = { query: "", category: "", from: "", to: "" };

function readFilters(): FilterState {
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    if (!raw) return EMPTY_FILTERS;
    return { ...EMPTY_FILTERS, ...JSON.parse(raw) };
  } catch {
    return EMPTY_FILTERS;
  }
}

const Index = () => {
  const { isAuthed, login, logout } = useAuth();
  const {
    expenses,
    categories,
    budgets,
    addExpense,
    updateExpense,
    deleteExpense,
    addCategory,
    setBudget,
  } = useExpenses();
  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [view, setView] = useState<View>("today");
  const [searchOpen, setSearchOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>(readFilters);
  const [details, setDetails] = useState<Expense | null>(null);
  const [budgetsOpen, setBudgetsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Expense | null>(null);
  const today = todayISO();

  // Persist filters across view switches and sessions
  useEffect(() => {
    try {
      localStorage.setItem(FILTERS_KEY, JSON.stringify(filters));
    } catch {
      // ignore
    }
  }, [filters]);

  // Keep details drawer in sync if the underlying expense changes (e.g. after edit)
  useEffect(() => {
    if (!details) return;
    const fresh = expenses.find((e) => e.id === details.id);
    if (!fresh) setDetails(null);
    else if (fresh !== details) setDetails(fresh);
  }, [expenses, details]);

  const todayExpenses = useMemo(
    () => expenses.filter((e) => e.date === today),
    [expenses, today]
  );
  const todayTotal = todayExpenses.reduce((a, b) => a + b.amount, 0);

  const monthStart = startOfMonthISO();
  const spentByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach((e) => {
      if (e.date >= monthStart)
        map[e.category] = (map[e.category] || 0) + e.amount;
    });
    return map;
  }, [expenses, monthStart]);

  if (!isAuthed) return <Login onLogin={login} />;

  const handleEdit = (e: Expense) => {
    setDetails(null);
    setEditing(e);
    setOpen(true);
  };

  const handleAskDelete = (e: Expense) => setConfirmDelete(e);

  return (
    <main className="min-h-dvh bg-background text-foreground font-sans">
      <div className="w-full max-w-[520px] mx-auto px-6 pt-16 pb-32">
        {/* Header */}
        <header className="flex items-center justify-between mb-12">
          <div>
            <h1 className="font-serif text-2xl text-foreground">Ledger</h1>
            <p className="text-xs text-ink-muted mt-0.5">{fullDateLabel(today)}</p>
          </div>
          <div className="flex items-center gap-2">
            <nav className="flex gap-1 bg-surface rounded-full p-1 text-xs">
              {(["today", "week", "month"] as View[]).map((v) => (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  className={cn(
                    "px-3 py-1.5 rounded-full uppercase tracking-wider transition-colors",
                    view === v
                      ? "bg-background text-foreground shadow-sm"
                      : "text-ink-muted hover:text-foreground"
                  )}
                >
                  {v}
                </button>
              ))}
            </nav>
            <button
              onClick={() => setSearchOpen(true)}
              aria-label="Search expenses"
              title="Search"
              className="text-ink-muted hover:text-foreground p-2 rounded-full hover:bg-surface transition-colors"
            >
              <Search className="h-4 w-4" />
            </button>
            <button
              onClick={logout}
              aria-label="Sign out"
              title="Sign out"
              className="text-ink-muted hover:text-foreground p-2 rounded-full hover:bg-surface transition-colors"
            >
              <LogOut className="h-4 w-4" />
            </button>
          </div>
        </header>

        {/* Hero total */}
        <section className="flex flex-col items-center text-center space-y-5 mb-12">
          <span className="text-ink-muted text-[10px] tracking-[0.25em] uppercase font-medium">
            {view === "today" ? "Today's outgoings" : "Today"}
          </span>
          <div className="font-serif text-7xl md:text-8xl font-normal tracking-tight text-foreground flex items-start">
            <span className="text-ink-muted/40 text-4xl mt-3 mr-1">₹</span>
            {formatINR(todayTotal)}
          </div>
        </section>

        <div className="flex justify-center mb-12">
          <Button
            onClick={() => { setEditing(null); setOpen(true); }}
            className="rounded-full bg-foreground text-background hover:bg-foreground/90 px-7 h-12 text-sm font-medium"
          >
            <Plus className="h-4 w-4 mr-1" /> Add expense
          </Button>
        </div>

        {view === "today" && (
          <section>
            <h3 className="text-ink-muted/70 text-[10px] tracking-[0.2em] uppercase font-medium mb-6 text-center">
              {todayExpenses.length === 0 ? "Nothing logged yet" : "Recorded today"}
            </h3>
            {todayExpenses.length === 0 ? (
              <p className="text-center text-ink-muted text-sm font-light max-w-xs mx-auto">
                Tap <span className="text-foreground">Add expense</span> to log your first entry.
              </p>
            ) : (
              <div className="flex flex-col divide-y divide-border/50">
                {todayExpenses.map((e) => (
                  <ExpenseRow
                    key={e.id}
                    expense={e}
                    onSelect={setDetails}
                    onDelete={() => handleAskDelete(e)}
                  />
                ))}
              </div>
            )}
          </section>
        )}

        {view === "week" && <WeeklyView expenses={expenses} />}

        {view === "month" && (
          <MonthlyView
            expenses={expenses}
            budgets={budgets}
            onOpenBudgets={() => setBudgetsOpen(true)}
          />
        )}
      </div>

      <AddExpenseSheet
        open={open}
        onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}
        categories={categories}
        onAdd={addExpense}
        onAddCategory={addCategory}
        editing={editing}
        onUpdate={updateExpense}
      />

      <SearchOverlay
        open={searchOpen}
        onOpenChange={setSearchOpen}
        expenses={expenses}
        categories={categories}
        filters={filters}
        onFiltersChange={setFilters}
        onSelect={(e) => {
          setSearchOpen(false);
          setDetails(e);
        }}
      />

      <ExpenseDetailsDrawer
        expense={details}
        onOpenChange={(v) => { if (!v) setDetails(null); }}
        onEdit={handleEdit}
        onDelete={deleteExpense}
      />

      <BudgetsSheet
        open={budgetsOpen}
        onOpenChange={setBudgetsOpen}
        categories={categories}
        budgets={budgets}
        spentByCategory={spentByCategory}
        onSetBudget={setBudget}
      />

      <AlertDialog
        open={!!confirmDelete}
        onOpenChange={(v) => { if (!v) setConfirmDelete(null); }}
      >
        <AlertDialogContent className="bg-background border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-2xl font-normal">
              Delete this entry?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete
                ? `₹${formatINR(confirmDelete.amount)} · ${confirmDelete.category}${
                    confirmDelete.note ? ` · ${confirmDelete.note}` : ""
                  }. This can't be undone.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (confirmDelete) deleteExpense(confirmDelete.id);
                setConfirmDelete(null);
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
};

export default Index;
