import { useEffect, useMemo, useState } from "react";
import { Plus, Search, Settings as SettingsIcon, ChevronDown, Loader2, RefreshCw } from "lucide-react";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AddExpenseSheet } from "@/components/AddExpenseSheet";
import { ExpenseRow } from "@/components/ExpenseRow";
import { WeeklyView } from "@/components/WeeklyView";
import { MonthlyView } from "@/components/MonthlyView";
import { FilterState } from "@/components/SearchFilters";
import { SearchOverlay } from "@/components/SearchOverlay";
import { ExpenseDetailsDrawer } from "@/components/ExpenseDetailsDrawer";
import { BudgetsSheet } from "@/components/BudgetsSheet";
import { ImportSheet } from "@/components/ImportSheet";
import { PeriodNav } from "@/components/PeriodNav";
import Settings from "@/pages/Settings";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import Login from "@/pages/Login";
import { useExpenses } from "@/hooks/useExpenses";
import { useAuth } from "@/hooks/useAuth";
import { useTheme } from "@/hooks/useTheme";
import {
  Expense, addDays, formatINR, fullDateLabel,
  monthRangeOf, shiftMonth, shiftWeek, startOfMonthISO, todayISO, weekRangeOf,
} from "@/lib/expenses";
import { cn } from "@/lib/utils";

type View = "today" | "week" | "month";

const FILTERS_KEY = "finlo.filters.v1";
const EMPTY_FILTERS: FilterState = { query: "", category: "", from: "", to: "" };

function readFilters(): FilterState {
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    if (!raw) return EMPTY_FILTERS;
    return { ...EMPTY_FILTERS, ...JSON.parse(raw) };
  } catch { return EMPTY_FILTERS; }
}

const Index = () => {
  const { isAuthed, loading, login, logout, profile, updateProfile, isAdmin, user } = useAuth();
  const { theme, update: updateTheme } = useTheme();
  const exp = useExpenses(user?.id ?? null);
  const {
    expenses, categories, budgets,
    syncing, lastSync, sync,
    addExpense, updateExpense, deleteExpense,
    addCategory, renameCategory, deleteCategory, setCategoryStyle,
    addSubcategory, deleteSubcategory,
    importExpenses, setBudget,
    exportData, restoreData,
  } = exp;

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [view, setView] = useState<View>("today");
  const [searchOpen, setSearchOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>(readFilters);
  const [details, setDetails] = useState<Expense | null>(null);
  const [budgetsOpen, setBudgetsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Expense | null>(null);

  const today = todayISO();
  const yesterday = addDays(today, -1);
  const dayBefore = addDays(today, -2);

  const [dayAnchor, setDayAnchor] = useState(today);
  const [weekAnchor, setWeekAnchor] = useState(today);
  const [monthAnchor, setMonthAnchor] = useState(today);

  useEffect(() => {
    try { localStorage.setItem(FILTERS_KEY, JSON.stringify(filters)); } catch { /* ignore */ }
  }, [filters]);

  useEffect(() => {
    if (!details) return;
    const fresh = expenses.find((e) => e.id === details.id);
    if (!fresh) setDetails(null);
    else if (fresh !== details) setDetails(fresh);
  }, [expenses, details]);

  const dayExpenses = useMemo(
    () => expenses.filter((e) => e.date === dayAnchor),
    [expenses, dayAnchor]
  );
  const dayTotal = dayExpenses.reduce((a, b) => a + b.amount, 0);

  const expensesByDate = (d: string) => expenses.filter((e) => e.date === d);
  const sumByDate = (d: string) => expensesByDate(d).reduce((a, b) => a + b.amount, 0);

  const monthStart = startOfMonthISO();
  const spentByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach((e) => {
      if (e.date >= monthStart) map[e.category] = (map[e.category] || 0) + e.amount;
    });
    return map;
  }, [expenses, monthStart]);

  if (loading) {
    return (
      <main className="min-h-dvh flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-ink-muted" />
      </main>
    );
  }
  if (!isAuthed) return <Login onLogin={login} />;
  if (isAdmin) return <Navigate to="/admin" replace />;

  const handleAskDelete = (e: Expense) => setConfirmDelete(e);

  let heroLabel = "Today's outgoings";
  let heroTotal = dayTotal;
  if (view === "today") {
    heroLabel =
      dayAnchor === today ? "Today's outgoings"
      : dayAnchor === yesterday ? "Yesterday"
      : dayAnchor === dayBefore ? "Day before yesterday"
      : fullDateLabel(dayAnchor);
    heroTotal = dayTotal;
  } else if (view === "week") {
    const r = weekRangeOf(weekAnchor);
    heroLabel = "Week total";
    heroTotal = expenses.filter((e) => e.date >= r.from && e.date <= r.to).reduce((a, b) => a + b.amount, 0);
  } else {
    const r = monthRangeOf(monthAnchor);
    heroLabel = "Month total";
    heroTotal = expenses.filter((e) => e.date >= r.from && e.date <= r.to).reduce((a, b) => a + b.amount, 0);
  }

  const periodLabel =
    view === "today"
      ? (dayAnchor === today ? "Today"
        : dayAnchor === yesterday ? "Yesterday"
        : dayAnchor === dayBefore ? "Day before yesterday"
        : new Date(dayAnchor + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }))
      : view === "week" ? weekRangeOf(weekAnchor).label
      : monthRangeOf(monthAnchor).label;

  const onPrev = () => {
    if (view === "today") setDayAnchor(addDays(dayAnchor, -1));
    else if (view === "week") setWeekAnchor(shiftWeek(weekAnchor, -1));
    else setMonthAnchor(shiftMonth(monthAnchor, -1));
  };
  const onNext = () => {
    if (view === "today") {
      const n = addDays(dayAnchor, 1);
      if (n <= today) setDayAnchor(n);
    } else if (view === "week") {
      const n = shiftWeek(weekAnchor, 1);
      if (weekRangeOf(n).from <= today) setWeekAnchor(n);
    } else {
      const n = shiftMonth(monthAnchor, 1);
      if (monthRangeOf(n).from <= today) setMonthAnchor(n);
    }
  };
  const canNext =
    view === "today" ? dayAnchor < today
    : view === "week" ? weekRangeOf(shiftWeek(weekAnchor, 1)).from <= today
    : monthRangeOf(shiftMonth(monthAnchor, 1)).from <= today;

  return (
    <main className="min-h-dvh bg-background text-foreground font-sans">
      <div className="w-full max-w-[520px] mx-auto px-6 pt-12 pb-32">
        <header className="flex items-center justify-between mb-10">
          <div className="flex items-center gap-2.5">
            <div className="h-9 w-9 rounded-xl bg-foreground text-background flex items-center justify-center font-serif text-lg">F</div>
            <div>
              <h1 className="font-serif text-xl text-foreground leading-none">Finlo</h1>
              <p className="text-[10px] text-ink-muted mt-1 tracking-wider uppercase">{profile.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-1">
            <nav className="flex gap-0.5 bg-surface rounded-full p-1 text-xs mr-1">
              {(["today", "week", "month"] as View[]).map((v) => (
                <button
                  key={v} onClick={() => setView(v)}
                  className={cn(
                    "px-3 py-1.5 rounded-full uppercase tracking-wider transition-colors",
                    view === v ? "bg-background text-foreground shadow-sm" : "text-ink-muted hover:text-foreground"
                  )}
                >{v}</button>
              ))}
            </nav>
            <button
              onClick={() => sync()}
              disabled={syncing}
              title={lastSync ? `Last sync: ${new Date(lastSync).toLocaleTimeString()}` : "Sync"}
              aria-label="Sync"
              className="text-ink-muted hover:text-foreground p-2 rounded-full hover:bg-surface disabled:opacity-50"
            >
              <RefreshCw className={cn("h-4 w-4", syncing && "animate-spin")} />
            </button>
            <button onClick={() => setSearchOpen(true)} aria-label="Search" title="Search"
              className="text-ink-muted hover:text-foreground p-2 rounded-full hover:bg-surface">
              <Search className="h-4 w-4" />
            </button>
            <button onClick={() => setSettingsOpen(true)} aria-label="Settings" title="Settings"
              className="text-ink-muted hover:text-foreground p-2 rounded-full hover:bg-surface">
              <SettingsIcon className="h-4 w-4" />
            </button>
          </div>
        </header>

        <section className="flex flex-col items-center text-center space-y-5 mb-8">
          <span className="text-ink-muted text-[10px] tracking-[0.25em] uppercase font-medium">
            {heroLabel}
          </span>
          <div className="font-serif text-7xl md:text-8xl font-normal tracking-tight text-foreground flex items-start">
            <span className="text-ink-muted/40 text-4xl mt-3 mr-1">₹</span>
            {formatINR(heroTotal)}
          </div>
        </section>

        <PeriodNav label={periodLabel} onPrev={onPrev} onNext={onNext} canNext={canNext} />

        <div className="flex justify-center mb-12">
          <Button
            onClick={() => { setEditing(null); setOpen(true); }}
            className="rounded-full bg-foreground text-background hover:bg-foreground/90 px-7 h-12 text-sm font-medium shadow-md"
          >
            <Plus className="h-4 w-4 mr-1" /> Add expense
          </Button>
        </div>

        {view === "today" && (
          <section>
            <h3 className="text-ink-muted/70 text-[10px] tracking-[0.2em] uppercase font-medium mb-6 text-center">
              {dayExpenses.length === 0 ? "Nothing logged" : "Recorded"}
            </h3>
            {dayExpenses.length === 0 ? (
              <p className="text-center text-ink-muted text-sm font-light max-w-xs mx-auto">
                Tap <span className="text-foreground">Add expense</span> to log your first entry.
              </p>
            ) : (
              <div className="flex flex-col divide-y divide-border/50">
                {dayExpenses.map((e) => (
                  <ExpenseRow
                    key={e.id} expense={e} onSelect={setDetails}
                    onDelete={() => handleAskDelete(e)}
                  />
                ))}
              </div>
            )}

            {dayAnchor === today && (
              <div className="mt-10 space-y-3">
                {[
                  { date: yesterday, label: "Yesterday" },
                  { date: dayBefore, label: "Day before yesterday" },
                ].map(({ date, label }) => {
                  const items = expensesByDate(date);
                  const total = sumByDate(date);
                  return (
                    <Collapsible key={date}>
                      <CollapsibleTrigger className="w-full flex items-center justify-between px-4 py-3 rounded-2xl bg-surface/50 hover:bg-surface transition-colors text-left border border-border/40">
                        <span className="flex items-center gap-2 text-sm text-foreground">
                          <ChevronDown className="h-3.5 w-3.5 text-ink-muted" />
                          {label}
                          <span className="text-ink-muted text-xs">({items.length})</span>
                        </span>
                        <span className="font-serif text-base text-foreground tabular-nums">
                          ₹{formatINR(total)}
                        </span>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        {items.length === 0 ? (
                          <p className="text-xs text-ink-muted text-center py-3">No expenses logged.</p>
                        ) : (
                          <div className="flex flex-col divide-y divide-border/50 pl-2 pt-1">
                            {items.map((e) => (
                              <ExpenseRow key={e.id} expense={e} onSelect={setDetails} />
                            ))}
                          </div>
                        )}
                      </CollapsibleContent>
                    </Collapsible>
                  );
                })}
              </div>
            )}
          </section>
        )}

        {view === "week" && (
          <WeeklyView expenses={expenses} categories={categories} anchor={weekAnchor} onSelect={setDetails} />
        )}

        {view === "month" && (
          <MonthlyView
            expenses={expenses} budgets={budgets}
            onOpenBudgets={() => setBudgetsOpen(true)}
            anchor={monthAnchor} onSelect={setDetails}
          />
        )}
      </div>

      <AddExpenseSheet
        open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}
        categories={categories} onAdd={addExpense}
        onAddCategory={addCategory} onAddSubcategory={addSubcategory}
        editing={editing} onUpdate={updateExpense}
      />

      <SearchOverlay
        open={searchOpen} onOpenChange={setSearchOpen}
        expenses={expenses} categories={categories}
        filters={filters} onFiltersChange={setFilters}
        onSelect={(e) => { setSearchOpen(false); setDetails(e); }}
        username={profile.name || profile.email.split("@")[0]}
      />

      <ExpenseDetailsDrawer
        expense={details} categories={categories}
        onOpenChange={(v) => { if (!v) setDetails(null); }}
        onUpdate={updateExpense} onDelete={deleteExpense}
        onAddSubcategory={addSubcategory}
      />

      <BudgetsSheet
        open={budgetsOpen} onOpenChange={setBudgetsOpen}
        categories={categories} budgets={budgets}
        spentByCategory={spentByCategory} onSetBudget={setBudget}
      />

      <ImportSheet open={importOpen} onOpenChange={setImportOpen} onImport={importExpenses} />

      <Settings
        open={settingsOpen} onOpenChange={setSettingsOpen}
        categories={categories}
        onAddCategory={addCategory} onRenameCategory={renameCategory}
        onDeleteCategory={deleteCategory} onSetCategoryStyle={setCategoryStyle}
        onAddSubcategory={addSubcategory} onDeleteSubcategory={deleteSubcategory}
        onOpenBudgets={() => setBudgetsOpen(true)}
        onOpenImport={() => setImportOpen(true)}
        onOpenSearch={() => setSearchOpen(true)}
        profile={profile} onUpdateProfile={updateProfile}
        theme={theme} onUpdateTheme={updateTheme}
        onLogout={logout}
        onSync={sync} syncing={syncing} lastSync={lastSync}
        onExportData={exportData} onRestoreData={restoreData}
        isAdmin={isAdmin}
      />

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => { if (!v) setConfirmDelete(null); }}>
        <AlertDialogContent className="bg-background border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-2xl font-normal">
              Delete this entry?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete
                ? `₹${formatINR(confirmDelete.amount)} · ${confirmDelete.category}${confirmDelete.note ? ` · ${confirmDelete.note}` : ""}. This can't be undone.`
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
            >Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
};

export default Index;
