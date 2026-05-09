import { Plus, Search, Settings as SettingsIcon, ChevronDown, Home, Wallet, ArrowLeftRight } from "lucide-react";
import { Navigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { AddExpenseSheet } from "@/components/AddExpenseSheet";
import { ExpenseRow } from "@/components/ExpenseRow";
import { WeeklyView } from "@/components/WeeklyView";
import { MonthlyView } from "@/components/MonthlyView";
import { FilterState } from "@/components/SearchFilters";
import { SearchOverlay } from "@/components/SearchOverlay";
import { QuickAddBar } from "@/components/QuickAddBar";
import { AskDataDrawer } from "@/components/AskDataDrawer";
import { ImportSheet } from "@/components/ImportSheet";
import { BudgetsSheet } from "@/components/BudgetsSheet";
import { RecurringSheet } from "@/components/RecurringSheet";
import { LoansSheet } from "@/components/LoansSheet";
import { TrashSheet } from "@/components/TrashSheet";
import { PeriodNav } from "@/components/PeriodNav";
import { ExpenseDetailsDrawer } from "@/components/ExpenseDetailsDrawer";
import { useEffect, useMemo, useState, useCallback, useRef } from "react";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import Settings from "@/pages/Settings";
import { useExpenses } from "@/hooks/useExpenses";
import { useAuth } from "@/hooks/useAuth";
import { useBudgetAlerts } from "@/hooks/useBudgetAlerts";
import { useExpenseAIQuickFlow } from "@/hooks/useExpenseAIQuickFlow";
import { useTheme } from "@/hooks/useTheme";
import { supabase } from "@/integrations/supabase/client";
import {
  Expense, addDays, formatINR, fullDateLabel, getCurrencySymbol,
  monthRangeOf, shiftMonth, shiftWeek, startOfMonthISO, todayISO, weekRangeOf,
  baseAmountOf,
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
  const { logout, profile, updateProfile, isAdmin, user } = useAuth();
  const { theme, update: updateTheme } = useTheme();
  // Admins never use the consumer app — skip data subscriptions for them.
  const expenseUserId = !isAdmin ? user?.id ?? null : null;
  const {
    expenses, categories, budgets,
    syncing, lastSync, sync,
    addExpense, updateExpense, deleteExpense,
    addCategory, renameCategory, deleteCategory, setCategoryStyle,
    addSubcategory, deleteSubcategory,
    importExpenses, setBudget,
    exportData, restoreData,
  } = useExpenses(expenseUserId);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [view, setView] = useState<View>("today");
  const [searchOpen, setSearchOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>(readFilters);
  const [details, setDetails] = useState<Expense | null>(null);
  const [budgetsOpen, setBudgetsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [loansOpen, setLoansOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [askAIOpen, setAskAIOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Expense | null>(null);
  const [quickAddCycle, setQuickAddCycle] = useState(0);
  const quickAddTranscriptRef = useRef<((text: string) => void) | null>(null);

  const today = todayISO();
  const yesterday = addDays(today, -1);
  const dayBefore = addDays(today, -2);
  const dayBeforeName = new Date(dayBefore + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" });

  const [dayAnchor, setDayAnchor] = useState(today);
  const [weekAnchor, setWeekAnchor] = useState(today);
  const [monthAnchor, setMonthAnchor] = useState(today);

  interface Loan {
    id: string;
    user_id: string;
    counterparty: string;
    amount: number;
    direction: "lent" | "borrowed";
    date: string;
    note?: string | null;
    expense_id?: string | null;
    status: "open" | "closed";
  }

  const [loans, setLoans] = useState<Loan[]>([]);
  const loadLoans = useCallback(async () => {
    if (!user?.id) return;
    const { data } = await supabase
      .from("loans")
      .select("*")
      .eq("user_id", user.id)
      .eq("status", "open");
    setLoans((data as unknown as Loan[]) ?? []);
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) {
      loadLoans();
    }
  }, [user?.id, expenses, loadLoans]);

  const openLoans = loans.filter((l) => l.status === "open");
  const owedToMeSum = openLoans.filter((l) => l.direction === "lent").reduce((a, b) => a + Number(b.amount), 0);
  const iOweSum = openLoans.filter((l) => l.direction === "borrowed").reduce((a, b) => a + Number(b.amount), 0);

  useEffect(() => {
    try { localStorage.setItem(FILTERS_KEY, JSON.stringify(filters)); } catch { /* ignore */ }
  }, [filters]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA" ||
        document.activeElement?.getAttribute("contenteditable") === "true"
      ) {
        return;
      }

      if (e.key === "n" || e.key === "N" || e.key === "a" || e.key === "A") {
        e.preventDefault();
        setOpen(true);
      } else if (e.key === "s" || e.key === "S") {
        e.preventDefault();
        setSettingsOpen(true);
      } else if (e.key === "t" || e.key === "T") {
        e.preventDefault();
        setView("today");
      } else if (e.key === "w" || e.key === "W") {
        e.preventDefault();
        setView("week");
      } else if (e.key === "m" || e.key === "M") {
        e.preventDefault();
        setView("month");
      } else if (e.key === "?" || e.key === "/") {
        if (e.key === "?") {
          e.preventDefault();
          setShortcutsHelpOpen(true);
        }
      } else if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setSearchOpen(true);
      } else if ((e.metaKey || e.ctrlKey) && (e.key === "j" || e.key === "J")) {
        e.preventDefault();
        setAskAIOpen(true);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!details) return;
    const fresh = expenses.find((e) => e.id === details.id);
    if (!fresh) setDetails(null);
    else if (fresh !== details) setDetails(fresh);
  }, [expenses, details]);

  const isExp = (e: Expense) => (e.type ?? "expense") === "expense";
  const isInc = (e: Expense) => e.type === "income";
  const sumOut = (rows: Expense[]) => rows.filter(isExp).reduce((a, b) => a + baseAmountOf(b), 0);
  const sumIn = (rows: Expense[]) => rows.filter(isInc).reduce((a, b) => a + baseAmountOf(b), 0);

  const dayExpenses = useMemo(
    () => expenses.filter((e) => e.date === dayAnchor),
    [expenses, dayAnchor]
  );
  const dayTotal = sumOut(dayExpenses);
  const dayIncome = sumIn(dayExpenses);

  const expensesByDate = (d: string) => expenses.filter((e) => e.date === d);
  const sumByDate = (d: string) => sumOut(expensesByDate(d));

  const monthStart = startOfMonthISO();
  const spentByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach((e) => {
      if (e.date >= monthStart && isExp(e)) map[e.category] = (map[e.category] || 0) + baseAmountOf(e);
    });
    return map;
  }, [expenses, monthStart]);

  useBudgetAlerts(spentByCategory, budgets);

  const quickDefaultDate = useMemo(
    () => (view === "today" ? dayAnchor : today),
    [view, dayAnchor, today]
  );

  const expenseAI = useExpenseAIQuickFlow({
    categories,
    defaultDate: quickDefaultDate,
    onAdd: addExpense,
    onParsedTranscript: (t) => quickAddTranscriptRef.current?.(t),
    onTapAddExpense: () => {
      setEditing(null);
      setOpen(true);
    },
    onAfterExpenseLogged: () => setQuickAddCycle((c) => c + 1),
  });

  if (isAdmin) return <Navigate to="/admin" replace />;

  const handleAskDelete = (e: Expense) => setConfirmDelete(e);

  let heroLabel = "Today's outgoings";
  let heroTotal = dayTotal;
  let heroIncome = dayIncome;
  if (view === "today") {
    heroLabel =
      dayAnchor === today ? "Today's outgoings"
      : dayAnchor === yesterday ? "Yesterday"
      : dayAnchor === dayBefore ? dayBeforeName
      : fullDateLabel(dayAnchor);
    heroTotal = dayTotal;
    heroIncome = dayIncome;
  } else if (view === "week") {
    const r = weekRangeOf(weekAnchor);
    heroLabel = "Week total";
    const rows = expenses.filter((e) => e.date >= r.from && e.date <= r.to);
    heroTotal = sumOut(rows);
    heroIncome = sumIn(rows);
  } else {
    const r = monthRangeOf(monthAnchor);
    heroLabel = "Month total";
    const rows = expenses.filter((e) => e.date >= r.from && e.date <= r.to);
    heroTotal = sumOut(rows);
    heroIncome = sumIn(rows);
  }
  const heroNet = heroIncome - heroTotal;

  const periodLabel =
    view === "today"
      ? (dayAnchor === today ? "Today"
        : dayAnchor === yesterday ? "Yesterday"
        : dayAnchor === dayBefore ? dayBeforeName
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
      <div className="w-full max-w-[520px] mx-auto px-6 pt-0 pb-32">
        <header className="sticky top-0 z-40 bg-background/80 backdrop-blur-md -mx-6 px-6 pt-6 pb-4 mb-8 border-b border-border/10 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 min-w-0">
            <img src="/finlo-logo.png" alt="Finlo" className="h-7 w-7 sm:h-9 sm:w-9 rounded-xl object-contain shrink-0" />
            <div className="min-w-0">
              <h1 className="font-serif text-lg sm:text-xl text-foreground leading-none truncate">Finlo</h1>
              <p className="hidden sm:block text-[10px] text-ink-muted mt-1 tracking-wider uppercase truncate">{profile.name}</p>
            </div>
          </div>
          <div className="flex items-center gap-1 shrink-0">
            <nav className="flex gap-0.5 bg-surface rounded-full p-1 text-[10px] sm:text-xs mr-1" role="tablist" aria-label="Ledger view">
              {(["today", "week", "month"] as View[]).map((v) => (
                <button
                  key={v}
                  type="button"
                  role="tab"
                  aria-selected={view === v}
                  onClick={() => setView(v)}
                  className={cn(
                    "px-2.5 sm:px-3 py-1.5 rounded-full uppercase tracking-wider transition-colors",
                    view === v ? "bg-background text-foreground shadow-sm" : "text-ink-muted hover:text-foreground"
                  )}
                >{v}</button>
              ))}
            </nav>
            <button onClick={() => setAskAIOpen(true)} aria-label="Ask Maya" title="Ask Maya"
              className="text-ink-muted hover:text-foreground p-1 rounded-full hover:bg-surface transition-transform hover:scale-105 active:scale-95 shrink-0 flex items-center justify-center">
              <img src="/maya.png" alt="Maya" className="h-6 w-6 rounded-full object-cover border border-purple-500/20" />
            </button>
            <button onClick={() => setSearchOpen(true)} aria-label="Search" title="Search"
              className="text-ink-muted hover:text-foreground p-2 rounded-full hover:bg-surface">
              <Search className="h-4 w-4" />
            </button>
          </div>
        </header>

        <section className="flex flex-col items-center text-center space-y-5 mb-8">
          <span className="text-ink-muted text-[10px] tracking-[0.25em] uppercase font-medium">
            {heroLabel}
          </span>
          <div className="font-serif text-5xl xs:text-6xl md:text-8xl font-normal tracking-tight text-foreground flex items-start justify-center max-w-full px-4">
            <span className="text-ink-muted/40 text-2xl md:text-4xl mt-1.5 md:mt-3 mr-1 shrink-0">{getCurrencySymbol()}</span>
            <span className="truncate">{formatINR(heroTotal)}</span>
          </div>
          {(heroIncome > 0 || heroNet !== -heroTotal) && (
            <div className="flex items-center gap-4 text-xs">
              <span className="text-emerald-600 dark:text-emerald-400">
                + {getCurrencySymbol()}{formatINR(heroIncome)} in
              </span>
              <span className="text-ink-muted">·</span>
              <span className={cn(
                "font-medium",
                heroNet >= 0 ? "text-emerald-600 dark:text-emerald-400" : "text-destructive"
              )}>
                Net {heroNet >= 0 ? "+" : "−"}{getCurrencySymbol()}{formatINR(Math.abs(heroNet))}
              </span>
            </div>
          )}
        </section>

        <PeriodNav label={periodLabel} onPrev={onPrev} onNext={onNext} canNext={canNext} />

        <QuickAddBar
          key={quickAddCycle}
          registerTranscriptSink={(fn) => {
            quickAddTranscriptRef.current = fn;
          }}
          ai={{
            loading: expenseAI.loading,
            isListening: expenseAI.isListening,
            parseQuickAddText: expenseAI.parseQuickAddText,
          }}
          categories={categories}
          defaultDate={quickDefaultDate}
        />

        <div className="hidden sm:flex justify-center mb-12">
          <Button
            onClick={() => { setEditing(null); setOpen(true); }}
            className="rounded-full bg-foreground text-background hover:bg-foreground/90 px-7 h-12 text-sm font-medium shadow-md"
          >
            <Plus className="h-4 w-4 mr-1" /> Add transaction
          </Button>
        </div>

        {/* Lending Tracker Summary Widget */}
        {(owedToMeSum > 0 || iOweSum > 0) && (
          <div 
            role="button"
            tabIndex={0}
            onClick={() => setLoansOpen(true)}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") setLoansOpen(true); }}
            className="mb-8 p-4 rounded-2xl border border-border/40 bg-surface/30 backdrop-blur-md flex items-center justify-between cursor-pointer hover:bg-surface/50 transition-all"
          >
            <div className="flex items-center gap-3">
              <span className="h-8 w-8 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center font-serif text-lg font-semibold shrink-0">₹</span>
              <div className="min-w-0">
                <h4 className="text-xs font-semibold text-foreground">Lending & Debt</h4>
                <p className="text-[10px] text-ink-muted truncate">Active balances from loans</p>
              </div>
            </div>
            <div className="flex gap-4 text-right shrink-0">
              {owedToMeSum > 0 && (
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-ink-muted">Owed to me</p>
                  <p className="font-serif text-sm text-emerald-600 dark:text-emerald-400 tabular-nums font-semibold mt-0.5">
                    +{getCurrencySymbol()}{formatINR(owedToMeSum)}
                  </p>
                </div>
              )}
              {iOweSum > 0 && (
                <div>
                  <p className="text-[9px] uppercase tracking-wider text-ink-muted">I owe</p>
                  <p className="font-serif text-sm text-destructive tabular-nums font-semibold mt-0.5">
                    −{getCurrencySymbol()}{formatINR(iOweSum)}
                  </p>
                </div>
              )}
            </div>
          </div>
        )}

        {view === "today" && (
          <section>
            <h3 className="text-ink-muted/70 text-[10px] tracking-[0.2em] uppercase font-medium mb-6 text-center">
              {dayExpenses.length === 0 ? "Nothing logged" : "Recorded"}
            </h3>
            {dayExpenses.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-6 bg-surface/30 rounded-[32px] border border-dashed border-border/60">
                <div className="h-12 w-12 rounded-full bg-surface flex items-center justify-center mb-4">
                  <Plus className="h-6 w-6 text-ink-muted/40" />
                </div>
                <p className="text-center text-foreground text-sm font-medium">No entries for this day</p>
                <p className="text-center text-ink-muted text-xs mt-1 max-w-[200px]">
                  Tap <span className="text-foreground font-medium">Add transaction</span> to start tracking your cash flow.
                </p>
              </div>
            ) : (
              <div className="flex flex-col divide-y divide-border/50">
                {dayExpenses.map((e) => (
                  <ExpenseRow
                    key={e.id} expense={e} onSelect={setDetails}
                    onDelete={() => handleAskDelete(e)}
                    categories={categories}
                  />
                ))}
              </div>
            )}

            {dayAnchor === today && (
              <div className="mt-10 space-y-3">
                {[
                  { date: yesterday, label: "Yesterday" },
                  { date: dayBefore, label: dayBeforeName },
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
                          {getCurrencySymbol()}{formatINR(total)}
                        </span>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        {items.length === 0 ? (
                          <p className="text-xs text-ink-muted text-center py-3">No expenses logged.</p>
                        ) : (
                          <div className="flex flex-col divide-y divide-border/50 pl-2 pt-1">
                            {items.map((e) => (
                              <ExpenseRow key={e.id} expense={e} onSelect={setDetails} categories={categories} />
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
            anchor={monthAnchor} onSelect={setDetails} categories={categories}
          />
        )}
      </div>

      <AddExpenseSheet
        open={open} onOpenChange={(v) => { setOpen(v); if (!v) setEditing(null); }}
        categories={categories} onAdd={addExpense}
        onAddCategory={addCategory} onAddSubcategory={addSubcategory}
        editing={editing} onUpdate={updateExpense}
        budgets={budgets} spentByCategory={spentByCategory}
      />

      <SearchOverlay
        open={searchOpen} onOpenChange={setSearchOpen}
        expenses={expenses} categories={categories}
        filters={filters} onFiltersChange={setFilters}
        onSelect={(e) => { setSearchOpen(false); setDetails(e); }}
        onDelete={deleteExpense}
        username={profile.name || profile.email.split("@")[0]}
      />

      <ExpenseDetailsDrawer
        expense={details} categories={categories}
        onOpenChange={(v) => { if (!v) setDetails(null); }}
        onUpdate={updateExpense} onDelete={deleteExpense}
        onAddSubcategory={addSubcategory}
        userId={user?.id ?? null}
      />

      <BudgetsSheet
        open={budgetsOpen} onOpenChange={setBudgetsOpen}
        categories={categories} budgets={budgets}
        spentByCategory={spentByCategory} onSetBudget={setBudget}
      />

      <ImportSheet open={importOpen} onOpenChange={setImportOpen} onImport={importExpenses} />

      <RecurringSheet open={recurringOpen} onOpenChange={setRecurringOpen}
        categories={categories} userId={user?.id ?? null} />

      <LoansSheet open={loansOpen} onOpenChange={setLoansOpen} userId={user?.id ?? null} />

      <AskDataDrawer
        open={askAIOpen}
        onOpenChange={setAskAIOpen}
        transactions={expenses}
        categories={categories}
        addExpense={addExpense}
        addCategory={addCategory}
      />

      <Settings
        open={settingsOpen} onOpenChange={setSettingsOpen}
        categories={categories}
        onAddCategory={addCategory} onRenameCategory={renameCategory}
        onDeleteCategory={deleteCategory} onSetCategoryStyle={setCategoryStyle}
        onAddSubcategory={addSubcategory} onDeleteSubcategory={deleteSubcategory}
        onOpenBudgets={() => setBudgetsOpen(true)}
        onOpenImport={() => setImportOpen(true)}
        onOpenSearch={() => setSearchOpen(true)}
        onOpenRecurring={() => setRecurringOpen(true)}
        onOpenLoans={() => setLoansOpen(true)}
        onOpenTrash={() => setTrashOpen(true)}
        profile={profile} onUpdateProfile={updateProfile}
        theme={theme} onUpdateTheme={updateTheme}
        onLogout={logout}
        onSync={sync} syncing={syncing} lastSync={lastSync}
        onExportData={exportData} onRestoreData={restoreData}
        isAdmin={isAdmin}
      />

      <TrashSheet open={trashOpen} onOpenChange={setTrashOpen} userId={user?.id ?? null} onRestore={sync} />

      {expenseAI.reviewDialog}
      {expenseAI.voiceHud}

      <AlertDialog open={!!confirmDelete} onOpenChange={(v) => { if (!v) setConfirmDelete(null); }}>
        <AlertDialogContent className="bg-background border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-2xl font-normal">
              Delete this entry?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {confirmDelete
                ? `${getCurrencySymbol()}${formatINR(confirmDelete.amount)} · ${confirmDelete.category}${confirmDelete.note ? ` · ${confirmDelete.note}` : ""}. This can't be undone.`
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

      <AlertDialog open={shortcutsHelpOpen} onOpenChange={setShortcutsHelpOpen}>
        <AlertDialogContent className="bg-background border-border max-w-sm rounded-[24px]">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-2xl font-normal flex items-center gap-2">
              Keyboard Shortcuts
            </AlertDialogTitle>
            <AlertDialogDescription className="text-xs text-ink-muted">
              Speed track your transactions with quick desktop hotkeys.
            </AlertDialogDescription>
          </AlertDialogHeader>
          
          <div className="py-4 space-y-3.5">
            <div className="flex justify-between items-center text-sm">
              <span className="text-foreground">Add new transaction</span>
              <kbd className="font-mono bg-surface border border-border/60 px-2 py-0.5 rounded text-xs shadow-xs text-ink-muted font-bold">N</kbd>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-foreground">Voice quick log</span>
              <span className="text-xs text-ink-muted font-medium shrink-0 pl-3 text-right leading-snug">
                Hold the <Plus className="inline h-3 w-3 align-text-bottom mx-0.5" /> button at the bottom
              </span>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-foreground">Open Search / NL Entry</span>
              <div className="flex gap-1.5">
                <kbd className="font-mono bg-surface border border-border/60 px-1.5 py-0.5 rounded text-xs shadow-xs text-ink-muted font-bold">⌘</kbd>
                <kbd className="font-mono bg-surface border border-border/60 px-1.5 py-0.5 rounded text-xs shadow-xs text-ink-muted font-bold">K</kbd>
              </div>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-foreground">Ask Finlo AI Chat</span>
              <div className="flex gap-1.5">
                <kbd className="font-mono bg-surface border border-border/60 px-1.5 py-0.5 rounded text-xs shadow-xs text-ink-muted font-bold">⌘</kbd>
                <kbd className="font-mono bg-surface border border-border/60 px-1.5 py-0.5 rounded text-xs shadow-xs text-ink-muted font-bold">J</kbd>
              </div>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-foreground">Open Settings</span>
              <kbd className="font-mono bg-surface border border-border/60 px-2 py-0.5 rounded text-xs shadow-xs text-ink-muted font-bold">S</kbd>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-foreground">Switch to Daily Ledger</span>
              <kbd className="font-mono bg-surface border border-border/60 px-2 py-0.5 rounded text-xs shadow-xs text-ink-muted font-bold">T</kbd>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-foreground">Switch to Weekly Ledger</span>
              <kbd className="font-mono bg-surface border border-border/60 px-2 py-0.5 rounded text-xs shadow-xs text-ink-muted font-bold">W</kbd>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-foreground">Switch to Monthly Ledger</span>
              <kbd className="font-mono bg-surface border border-border/60 px-2 py-0.5 rounded text-xs shadow-xs text-ink-muted font-bold">M</kbd>
            </div>
            <div className="flex justify-between items-center text-sm">
              <span className="text-foreground">Show Keyboard Shortcuts</span>
              <kbd className="font-mono bg-surface border border-border/60 px-2 py-0.5 rounded text-xs shadow-xs text-ink-muted font-bold">?</kbd>
            </div>
          </div>
          
          <AlertDialogFooter>
            <AlertDialogCancel className="w-full rounded-full bg-foreground text-background hover:bg-foreground/90 border-0 h-10 font-medium">Got it</AlertDialogCancel>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Premium Glassmorphic Bottom Navigation Bar for Mobile */}
      <div className="fixed bottom-0 left-0 right-0 bg-background/80 backdrop-blur-xl border-t border-border/40 z-40 flex items-center justify-around md:hidden px-4 shadow-lg" style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 6px)", paddingTop: "6px", height: "auto" }}>
        <button
          onClick={() => {
            window.scrollTo({ top: 0, behavior: "smooth" });
          }}
          className="flex flex-col items-center justify-center text-ink-muted hover:text-foreground active:scale-95 transition-all gap-0.5 h-full px-3"
          aria-label="Home"
          title="Home"
        >
          <Home className="h-5 w-5" />
          <span className="text-[9px] font-medium tracking-wide">Home</span>
        </button>

        <button
          onClick={() => setBudgetsOpen(true)}
          className="flex flex-col items-center justify-center text-ink-muted hover:text-foreground active:scale-95 transition-all gap-0.5 h-full px-3"
          aria-label="Budgets"
          title="Budgets"
        >
          <Wallet className="h-5 w-5" />
          <span className="text-[9px] font-medium tracking-wide">Budgets</span>
        </button>

        {/* Center FAB — lifted, fluid motion */}
        <button
          type="button"
          {...expenseAI.fabPointerProps}
          className={cn(
            "relative isolate h-14 w-14 shrink-0 overflow-hidden rounded-full",
            "flex items-center justify-center",
            "bg-gradient-to-br from-foreground to-foreground/88",
            "text-background",
            "shadow-[0_12px_32px_-10px_hsl(var(--foreground)/0.5),0_4px_16px_-4px_hsl(220_30%_12%/0.12)]",
            "dark:shadow-[0_14px_40px_-12px_hsla(40,8%,98%,0.14),0_4px_16px_-4px_hsl(220_50%_4%/0.45)]",
            "ring-[3.5px] ring-background/95 dark:ring-background/90",
            "touch-manipulation select-none -translate-y-4",
            "transition-[transform,box-shadow] duration-300 ease-out",
            "hover:scale-[1.052] hover:-translate-y-[1.075rem]",
            "hover:shadow-[0_16px_40px_-12px_hsl(var(--foreground)/0.52),0_6px_20px_-6px_hsl(220_30%_12%/0.14)]",
            "active:scale-[0.93] active:-translate-y-[0.925rem]",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/55 focus-visible:ring-offset-[3px] focus-visible:ring-offset-background",
            "before:pointer-events-none before:absolute before:inset-0 before:rounded-full",
            "before:bg-gradient-to-br before:from-white/[0.14] before:via-transparent before:to-transparent",
            "dark:before:from-white/[0.08]",
            expenseAI.isListening &&
              "scale-[1.04] shadow-[0_0_0_6px_rgba(244,114,182,0.16),0_12px_32px_-10px_hsl(var(--foreground)/0.48)] ring-rose-400/45"
          )}
          aria-label="Add transaction. Press and hold to log by voice."
          title="Tap to add. Hold for voice."
        >
          <Plus className="relative z-[1] h-6 w-6 shrink-0 stroke-[2.25]" strokeLinecap="round" strokeLinejoin="round" />
        </button>

        <button
          onClick={() => setLoansOpen(true)}
          className="flex flex-col items-center justify-center text-ink-muted hover:text-foreground active:scale-95 transition-all gap-0.5 h-full px-3"
          aria-label="Loans"
          title="Loans"
        >
          <ArrowLeftRight className="h-5 w-5" />
          <span className="text-[9px] font-medium tracking-wide">Loans</span>
        </button>

        <button
          onClick={() => setSettingsOpen(true)}
          className="flex flex-col items-center justify-center text-ink-muted hover:text-foreground active:scale-95 transition-all gap-0.5 h-full px-3"
          aria-label="Settings"
          title="Settings"
        >
          <SettingsIcon className="h-5 w-5" />
          <span className="text-[9px] font-medium tracking-wide">Settings</span>
        </button>
      </div>
    </main>
  );
};

export default Index;
