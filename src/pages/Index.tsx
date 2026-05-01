import { useMemo, useState } from "react";
import { Plus, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddExpenseSheet } from "@/components/AddExpenseSheet";
import { ExpenseRow } from "@/components/ExpenseRow";
import { WeeklyView } from "@/components/WeeklyView";
import { MonthlyView } from "@/components/MonthlyView";
import { SearchFilters, FilterState } from "@/components/SearchFilters";
import Login from "@/pages/Login";
import { useExpenses } from "@/hooks/useExpenses";
import { useAuth } from "@/hooks/useAuth";
import { formatINR, fullDateLabel, todayISO } from "@/lib/expenses";
import { cn } from "@/lib/utils";

type View = "today" | "week" | "month" | "search";

const Index = () => {
  const { isAuthed, login, logout } = useAuth();
  const { expenses, categories, addExpense, deleteExpense, addCategory } = useExpenses();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("today");
  const [filters, setFilters] = useState<FilterState>({ query: "", category: "", from: "", to: "" });
  const today = todayISO();

  const todayExpenses = useMemo(
    () => expenses.filter((e) => e.date === today),
    [expenses, today]
  );
  const todayTotal = todayExpenses.reduce((a, b) => a + b.amount, 0);

  const filtered = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return expenses.filter((e) => {
      if (filters.category && e.category !== filters.category) return false;
      if (filters.from && e.date < filters.from) return false;
      if (filters.to && e.date > filters.to) return false;
      if (q) {
        const hay = [e.note, e.category, e.subcategory, e.payment_method]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [expenses, filters]);
  const filteredTotal = filtered.reduce((a, b) => a + b.amount, 0);

  if (!isAuthed) return <Login onLogin={login} />;

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
              {(["today", "week", "month", "search"] as View[]).map((v) => (
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
            {view === "search" ? "Filtered total" : view === "today" ? "Today's outgoings" : "Today"}
          </span>
          <div className="font-serif text-7xl md:text-8xl font-normal tracking-tight text-foreground flex items-start">
            <span className="text-ink-muted/40 text-4xl mt-3 mr-1">₹</span>
            {formatINR(view === "search" ? filteredTotal : todayTotal)}
          </div>
        </section>

        <div className="flex justify-center mb-12">
          <Button
            onClick={() => setOpen(true)}
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
                  <ExpenseRow key={e.id} expense={e} onDelete={deleteExpense} />
                ))}
              </div>
            )}
          </section>
        )}

        {view === "week" && <WeeklyView expenses={expenses} />}

        {view === "month" && <MonthlyView expenses={expenses} />}

        {view === "search" && (
          <section>
            <SearchFilters
              value={filters}
              onChange={setFilters}
              categories={categories}
              resultsCount={filtered.length}
            />
            {filtered.length === 0 ? (
              <p className="text-center text-ink-muted text-sm font-light max-w-xs mx-auto py-8">
                No expenses match your filters.
              </p>
            ) : (
              <div className="flex flex-col divide-y divide-border/50">
                {filtered.map((e) => (
                  <ExpenseRow key={e.id} expense={e} onDelete={deleteExpense} showDate />
                ))}
              </div>
            )}
          </section>
        )}
      </div>

      <AddExpenseSheet
        open={open}
        onOpenChange={setOpen}
        categories={categories}
        onAdd={addExpense}
        onAddCategory={addCategory}
      />
    </main>
  );
};

export default Index;
