import { useMemo, useState } from "react";
import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AddExpenseSheet } from "@/components/AddExpenseSheet";
import { ExpenseRow } from "@/components/ExpenseRow";
import { WeeklyView } from "@/components/WeeklyView";
import { MonthlyView } from "@/components/MonthlyView";
import { useExpenses } from "@/hooks/useExpenses";
import { formatINR, fullDateLabel, todayISO } from "@/lib/expenses";
import { cn } from "@/lib/utils";

type View = "today" | "week" | "month";

const Index = () => {
  const { expenses, categories, addExpense, deleteExpense, addCategory } = useExpenses();
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("today");
  const today = todayISO();

  const todayExpenses = useMemo(
    () => expenses.filter((e) => e.date === today),
    [expenses, today]
  );
  const todayTotal = todayExpenses.reduce((a, b) => a + b.amount, 0);

  return (
    <main className="min-h-dvh bg-background text-foreground font-sans">
      <div className="w-full max-w-[520px] mx-auto px-6 pt-16 pb-32">
        {/* Header */}
        <header className="flex items-center justify-between mb-12">
          <div>
            <h1 className="font-serif text-2xl text-foreground">Ledger</h1>
            <p className="text-xs text-ink-muted mt-0.5">{fullDateLabel(today)}</p>
          </div>
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
        </header>

        {/* Today's total — always visible */}
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
