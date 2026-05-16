import { Plus, Search, Settings as SettingsIcon, ChevronDown, Home, Wallet, ArrowLeftRight, HandCoins, ChevronRight, ShieldCheck, Lock, Users, Target } from "lucide-react";
import { Navigate, useNavigate } from "react-router-dom";
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
import { SubscriptionsSheet } from "@/components/SubscriptionsSheet";
import { LoansSheet } from "@/components/LoansSheet";
import { TrashSheet } from "@/components/TrashSheet";
import { PeriodNav } from "@/components/PeriodNav";
import { PulseCard } from "@/components/PulseCard";
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
import { JointGoalCard } from "@/components/JointGoalCard";
import { Card } from "@/components/ui/card";
import { useExpenses } from "@/hooks/useExpenses";
import { useAuth } from "@/hooks/useAuth";
import { useBudgetAlerts } from "@/hooks/useBudgetAlerts";
import { useExpenseAIQuickFlow } from "@/hooks/useExpenseAIQuickFlow";
import { useTheme } from "@/hooks/useTheme";
import { usePullToRefresh } from "@/hooks/usePullToRefresh";
import { useOverlayHistorySync } from "@/hooks/useOverlayHistorySync";
import { InstallAppBanner } from "@/components/InstallAppBanner";
import { PullRefreshIndicator } from "@/components/PullRefreshIndicator";
import { supabase } from "@/integrations/supabase/client";
import {
  Expense, addDays, formatINR, fullDateLabel, getCurrencySymbol,
  monthRangeOf, shiftMonth, shiftWeek, startOfMonthISO, todayISO, weekRangeOf,
  baseAmountOf,
} from "@/lib/expenses";
import { cn, vibrate } from "@/lib/utils";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/hooks/use-toast";
import type { ReceiptScanPrefill } from "@/components/AddExpenseSheet";

type View = "today" | "week" | "month";

const FILTERS_KEY = "finlo.filters.v1";
const EMPTY_FILTERS: FilterState = { query: "", category: "", from: "", to: "", reimbursableOnly: false };
const PULSE_FETCHED_KEY = "finlo.pulse_fetched.v1";

function readFilters(): FilterState {
  try {
    const raw = localStorage.getItem(FILTERS_KEY);
    if (!raw) return EMPTY_FILTERS;
    return { ...EMPTY_FILTERS, ...JSON.parse(raw) };
  } catch { return EMPTY_FILTERS; }
}

const Index = () => {
  const navigate = useNavigate();
  const { logout, profile, updateProfile, isAdmin, user, impersonatedUserId, impersonatedEmail, stopImpersonating } = useAuth();
  const { theme, update: updateTheme } = useTheme();
  // Impersonation targets another user's ledger; otherwise use the signed-in account (including admins).
  const expenseUserId = impersonatedUserId ?? user?.id ?? null;
  const {
    expenses, categories, budgets,
    syncing, lastSync, sync, initialDataReady, pendingCount,
    viewMode, setViewMode,
    addExpense, updateExpense, deleteExpense,
    addCategory, renameCategory, deleteCategory, setCategoryStyle,
    addSubcategory, deleteSubcategory,
    importExpenses, setBudget,
    exportData, restoreData, toggleReaction,
  } = useExpenses(expenseUserId, profile.household_id);

  const [open, setOpen] = useState(false);
  const [editing, setEditing] = useState<Expense | null>(null);
  const [view, setView] = useState<View>("today");
  const [scrollDir, setScrollDir] = useState<"up" | "down">("up");
  const [lastScrollY, setLastScrollY] = useState(0);
  const [isScrolled, setIsScrolled] = useState(false);
  const [touchStart, setTouchStart] = useState<number | null>(null);
  const [touchStartTime, setTouchStartTime] = useState<number>(0);
  const [isHolding, setIsHolding] = useState(false);
  const [jointGoals, setJointGoals] = useState<any[]>([]);

  useEffect(() => {
    if (!profile?.household_id) return;

    const fetchJointGoals = async () => {
      try {
        const { data: goals } = await (supabase as any)
          .from("household_goals")
          .select("*")
          .eq("household_id", profile.household_id)
          .order("created_at", { ascending: true });

        setJointGoals(goals || []);
      } catch (err) {
        console.error("Error fetching joint goals:", err);
      }
    };

    void fetchJointGoals();
  }, [profile?.household_id]);

  useEffect(() => {
    let holdTimer: any;

    const handleTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0) {
        const y = e.targetTouches[0].clientY;
        setTouchStart(y);
        setTouchStartTime(Date.now());
        
        // Start hold timer for 2 seconds
        holdTimer = setTimeout(() => {
          setIsHolding(true);
          vibrate([20, 10, 20]); // Haptic "double pulse" to indicate hold achieved
        }, 2000);
      }
    };

    const handleTouchEnd = (e: TouchEvent) => {
      if (holdTimer) clearTimeout(holdTimer);
      
      if (touchStart !== null) {
        const touchEnd = e.changedTouches[0].clientY;
        const duration = Date.now() - touchStartTime;
        const distance = touchEnd - touchStart;

        if (distance > 120) {
          if (duration >= 2000) {
            // Long hold while pulled down
            vibrate(30);
            setOpen(true);
          } else {
            // Quick pull down
            vibrate(10);
            sync({ silentToast: true });
          }
        }
        
        setTouchStart(null);
        setIsHolding(false);
      }
    };

    window.addEventListener("touchstart", handleTouchStart, { passive: true });
    window.addEventListener("touchend", handleTouchEnd, { passive: true });
    return () => {
      clearTimeout(holdTimer);
      window.removeEventListener("touchstart", handleTouchStart);
      window.removeEventListener("touchend", handleTouchEnd);
    };
  }, [touchStart, touchStartTime, sync]);

  useEffect(() => {
    const handleScroll = () => {
      const y = window.scrollY;
      setIsScrolled(y > 20);
      
      if (Math.abs(y - lastScrollY) < 10) return;
      
      if (y > lastScrollY && y > 100) {
        setScrollDir("down");
      } else {
        setScrollDir("up");
      }
      setLastScrollY(y);
    };

    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, [lastScrollY]);

  const [searchOpen, setSearchOpen] = useState(false);
  const [filters, setFilters] = useState<FilterState>(readFilters);
  const [details, setDetails] = useState<Expense | null>(null);
  const [budgetsOpen, setBudgetsOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [recurringOpen, setRecurringOpen] = useState(false);
  const [subscriptionsOpen, setSubscriptionsOpen] = useState(false);
  const [loansOpen, setLoansOpen] = useState(false);
  const [trashOpen, setTrashOpen] = useState(false);
  const [shortcutsHelpOpen, setShortcutsHelpOpen] = useState(false);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [askAIOpen, setAskAIOpen] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<Expense | null>(null);
  const [quickAddCycle, setQuickAddCycle] = useState(0);
  const quickAddTranscriptRef = useRef<((text: string) => void) | null>(null);
  const mainRef = useRef<HTMLElement>(null);
  const [sharePrefill, setSharePrefill] = useState<string | undefined>();
  const [pullRefreshEnabled, setPullRefreshEnabled] = useState(false);

  const [isOnline, setIsOnline] = useState<boolean>(() => navigator.onLine);
  useEffect(() => {
    const handleOnline = () => setIsOnline(true);
    const handleOffline = () => setIsOnline(false);
    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);
    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);
  const [receiptScanPrefill, setReceiptScanPrefill] = useState<ReceiptScanPrefill | null>(null);

  const clearReceiptPrefill = useCallback(() => setReceiptScanPrefill(null), []);

  const handleAddExpense = (payload: any) => {
    const finalPayload = {
      ...payload,
      household_id: payload.household_id === "placeholder" ? profile.household_id : null,
    };
    addExpense(finalPayload);
  };

  const handleUpdateExpense = (id: string, patch: any) => {
    const finalPatch = {
      ...patch,
    };
    if (patch.household_id === "placeholder") {
      finalPatch.household_id = profile.household_id;
    }
    updateExpense(id, finalPatch);
  };

  const touchStartXRef = useRef<number>(0);
  const touchStartYRef = useRef<number>(0);

  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
  }, []);

  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    const startX = touchStartXRef.current;
    const startY = touchStartYRef.current;
    const endX = e.changedTouches[0].clientX;
    const endY = e.changedTouches[0].clientY;

    const diffX = endX - startX;
    const diffY = endY - startY;

    // Must be horizontal (X delta is greater than Y delta) and cross threshold (55px)
    if (Math.abs(diffX) > Math.abs(diffY) && Math.abs(diffX) > 55) {
      if (diffX > 0) {
        // Swiped right -> go to previous view (Month -> Week -> Today)
        setView((prev) => {
          if (prev === "month") { vibrate(15); return "week"; }
          if (prev === "week") { vibrate(15); return "today"; }
          return prev;
        });
      } else {
        // Swiped left -> go to next view (Today -> Week -> Month)
        setView((prev) => {
          if (prev === "today") { vibrate(15); return "week"; }
          if (prev === "week") { vibrate(15); return "month"; }
          return prev;
        });
      }
    }
  }, []);

  const anomalyExpenseIds = useMemo(() => {
    const ids = new Set<string>();
    const byCat: Record<string, Expense[]> = {};
    expenses.forEach((e) => {
      if ((e.type ?? "expense") !== "expense") return;
      if (!byCat[e.category]) byCat[e.category] = [];
      byCat[e.category].push(e);
    });
    Object.values(byCat).forEach((list) => {
      if (list.length < 4) return;
      list.forEach((e) => {
        const others = list.filter((x) => x.id !== e.id);
        const mean = others.reduce((a, x) => a + baseAmountOf(x), 0) / others.length;
        if (mean > 0 && baseAmountOf(e) > 2 * mean) ids.add(e.id);
      });
    });
    return ids;
  }, [expenses]);

  const totalBudgetCap = useMemo(() => {
    const vals = Object.values(budgets);
    if (vals.length === 0) return null;
    return vals.reduce((a, b) => a + b, 0);
  }, [budgets]);

  const today = todayISO();
  const yesterday = addDays(today, -1);
  const dayBefore = addDays(today, -2);
  const dayBeforeName = new Date(dayBefore.split("T")[0] + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" });

  const [dayAnchor, setDayAnchor] = useState(today);
  const [weekAnchor, setWeekAnchor] = useState(today);
  const [monthAnchor, setMonthAnchor] = useState(today);

  const monthSpendForBudgets = useMemo(() => {
    const ms = startOfMonthISO();
    return expenses
      .filter((e) => {
        const d = e.date.split("T")[0];
        return d >= ms && d <= today && (e.type ?? "expense") === "expense";
      })
      .reduce((a, e) => a + baseAmountOf(e), 0);
  }, [expenses, today]);

  const safeToSpend =
    totalBudgetCap != null && totalBudgetCap > 0
      ? Math.max(0, totalBudgetCap - monthSpendForBudgets)
      : null;

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

  const reimbursablesSummary = useMemo(() => {
    const pendingItems = expenses.filter((e) => e.is_reimbursable && !e.reimbursed_at);
    const settledItems = expenses.filter((e) => e.is_reimbursable && !!e.reimbursed_at);
    const pendingSum = pendingItems.reduce((a, e) => a + baseAmountOf(e), 0);
    const settledSum = settledItems.reduce((a, e) => a + baseAmountOf(e), 0);
    return {
      pendingSum,
      settledSum,
      pendingCount: pendingItems.length,
      settledCount: settledItems.length,
    };
  }, [expenses]);

  const handleOpenReimbursables = () => {
    setFilters({ query: "", category: "", from: "", to: "", reimbursableOnly: true });
    setSearchOpen(true);
  };

  useEffect(() => {
    try { localStorage.setItem(FILTERS_KEY, JSON.stringify(filters)); } catch { /* ignore */ }
  }, [filters]);

  useEffect(() => {
    const mq = window.matchMedia("(max-width: 767px)");
    const apply = () => setPullRefreshEnabled(mq.matches);
    apply();
    mq.addEventListener("change", apply);
    return () => mq.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const action = params.get("action")?.trim().toLowerCase() ?? "";
    if (action === "add") {
      setEditing(null);
      setOpen(true);
    }
    const title = params.get("title")?.trim() ?? "";
    const text = params.get("text")?.trim() ?? "";
    const url = params.get("url")?.trim() ?? "";
    const parts = [title, text, url].filter(Boolean);
    if (parts.length > 0) {
      setSharePrefill(parts.join("\n"));
    }
    if (action === "add" || parts.length > 0) {
      window.history.replaceState(
        {},
        document.title,
        `${window.location.pathname}${window.location.hash}`,
      );
    }
  }, []);

  // Scroll to top when switching view tabs
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [view]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const tag = document.activeElement?.tagName;
      if (
        tag === "INPUT" ||
        tag === "TEXTAREA" ||
        document.activeElement?.getAttribute("contenteditable") === "true"
      ) {
        return;
      }

      // Don't fire single-key shortcuts when any overlay is open
      const overlayOpen = searchOpen || settingsOpen || askAIOpen || budgetsOpen
        || loansOpen || recurringOpen || importOpen || trashOpen || !!details || open;

      if ((e.metaKey || e.ctrlKey) && (e.key === "k" || e.key === "K")) {
        e.preventDefault();
        setSearchOpen((p) => !p);
        return;
      }
      if ((e.metaKey || e.ctrlKey) && (e.key === "j" || e.key === "J")) {
        e.preventDefault();
        setAskAIOpen((p) => !p);
        return;
      }

      if (overlayOpen) return;

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
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [searchOpen, settingsOpen, askAIOpen, budgetsOpen, loansOpen, recurringOpen, importOpen, trashOpen, details, open]);

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
    () => expenses.filter((e) => e.date.split("T")[0] === dayAnchor),
    [expenses, dayAnchor]
  );
  const dayTotal = sumOut(dayExpenses);
  const dayIncome = sumIn(dayExpenses);

  const expensesByDate = (d: string) => expenses.filter((e) => e.date.split("T")[0] === d);
  const sumByDate = (d: string) => sumOut(expensesByDate(d));

  const monthStart = startOfMonthISO();
  const spentByCategory = useMemo(() => {
    const map: Record<string, number> = {};
    expenses.forEach((e) => {
      if (e.date.split("T")[0] >= monthStart && isExp(e)) map[e.category] = (map[e.category] || 0) + baseAmountOf(e);
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
      setSettingsOpen(false);
      setLoansOpen(false);
      setBudgetsOpen(false);
      setEditing(null);
      setOpen(true);
    },
    onAfterExpenseLogged: () => setQuickAddCycle((c) => c + 1),
  });

  const handlePulseNavigate = (target: string, params?: any) => {
    vibrate(10);
    switch (target) {
      case "budgets": setBudgetsOpen(true); break;
      case "search": setSearchOpen(true); break;
      case "subscriptions": setSubscriptionsOpen(true); break;
      case "loans": setLoansOpen(true); break;
      case "add_expense":
        if (params?.edit && params?.data) {
          setReceiptScanPrefill({
            amount: params.data.amount,
            merchant: params.data.note,
            categoryGuess: params.data.category,
            date: params.data.date
          });
        }
        setOpen(true);
        break;
    }
  };

  const handlePulseAction = async (handler: string, data: any): Promise<boolean> => {
    if (handler === "log_recurring") {
      try {
        const { error } = await supabase.from("expenses").insert(data);
        if (error) throw error;
        toast({ title: "Expense logged", description: `${data.category}: ${getCurrencySymbol()}${formatINR(data.amount)}` });
        sync();
        return true;
      } catch (err) {
        console.error("Failed to log recurring expense:", err);
        toast({ title: "Failed to log", variant: "destructive" });
        return false;
      }
    }
    return false;
  };

  const handlePullRefresh = useCallback(async () => {
    // Always pull from Supabase so prod/phone/other tabs stay aligned, not only when offline queue has items.
    const didSync = await sync({ silentToast: true });
    if (didSync) await loadLoans();
  }, [sync, loadLoans]);

  const { phase: pullPhase, pullPx } = usePullToRefresh(
    pullRefreshEnabled && !!expenseUserId,
    handlePullRefresh,
    mainRef,
  );

  // Household Ambient AI Pulses
  useEffect(() => {
    if (!profile.household_id || !initialDataReady) return;

    const lastFetched = localStorage.getItem(PULSE_FETCHED_KEY);
    const today = todayISO();
    if (lastFetched === today) return;

    const fetchHouseholdPulse = async () => {
      try {
        const { data, error } = await supabase.functions.invoke("household-pulse", {
          body: { household_id: profile.household_id },
        });
        if (error) throw error;
        if (data?.pulses) {
          localStorage.setItem(PULSE_FETCHED_KEY, today);
        }
      } catch (err) {
        console.error("Household pulse fetch failed:", err);
      }
    };

    fetchHouseholdPulse();
  }, [profile.household_id, initialDataReady]);

  const overlayCount = useMemo(
    () =>
      (confirmDelete ? 1 : 0) +
      (shortcutsHelpOpen ? 1 : 0) +
      (trashOpen ? 1 : 0) +
      (loansOpen ? 1 : 0) +
      (recurringOpen ? 1 : 0) +
      (importOpen ? 1 : 0) +
      (budgetsOpen ? 1 : 0) +
      (settingsOpen ? 1 : 0) +
      (searchOpen ? 1 : 0) +
      (askAIOpen ? 1 : 0) +
      (open ? 1 : 0) +
      (details ? 1 : 0),
    [
      confirmDelete,
      shortcutsHelpOpen,
      trashOpen,
      loansOpen,
      recurringOpen,
      importOpen,
      budgetsOpen,
      settingsOpen,
      searchOpen,
      askAIOpen,
      open,
      details,
    ],
  );

  const closeTopOverlay = useCallback(() => {
    if (details) {
      setDetails(null);
      return;
    }
    if (open) {
      setOpen(false);
      setEditing(null);
      clearReceiptPrefill();
      return;
    }
    if (askAIOpen) {
      setAskAIOpen(false);
      return;
    }
    if (searchOpen) {
      setSearchOpen(false);
      return;
    }
    if (settingsOpen) {
      setSettingsOpen(false);
      return;
    }
    if (budgetsOpen) {
      setBudgetsOpen(false);
      return;
    }
    if (importOpen) {
      setImportOpen(false);
      return;
    }
    if (recurringOpen) {
      setRecurringOpen(false);
      return;
    }
    if (subscriptionsOpen) {
      setSubscriptionsOpen(false);
      return;
    }
    if (loansOpen) {
      setLoansOpen(false);
      return;
    }
    if (trashOpen) {
      setTrashOpen(false);
      return;
    }
    if (shortcutsHelpOpen) {
      setShortcutsHelpOpen(false);
      return;
    }
    if (confirmDelete) {
      setConfirmDelete(null);
    }
  }, [
    details,
    open,
    askAIOpen,
    searchOpen,
    settingsOpen,
    budgetsOpen,
    importOpen,
    recurringOpen,
    loansOpen,
    trashOpen,
    shortcutsHelpOpen,
    confirmDelete,
    clearReceiptPrefill,
  ]);

  useOverlayHistorySync(overlayCount, closeTopOverlay);

  // Traps hardware back clicks on mobile home screen and demands a double tap to exit
  const lastBackPressRef = useRef<number>(0);
  useEffect(() => {
    if (overlayCount > 0) return;

    // Push the initial home page trap states if not set
    if (!window.history.state || (!window.history.state.finloExitTrap && !window.history.state.finloOverlay)) {
      window.history.replaceState({ finloHome: true }, "", window.location.href);
      window.history.pushState({ finloExitTrap: true }, "", window.location.href);
    }

    const handlePopState = (e: PopStateEvent) => {
      if (overlayCount > 0) return;

      const now = Date.now();
      if (now - lastBackPressRef.current < 2000) {
        // Double tap confirmed -> Let it pop out of the application cleanly
        window.history.go(-1);
      } else {
        lastBackPressRef.current = now;
        toast({
          title: "Press back again to exit",
          duration: 2000,
        });

        // Re-push the trap state to catch the next pop action
        window.history.pushState({ finloExitTrap: true }, "", window.location.href);
      }
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [overlayCount]);

  if (isAdmin && !impersonatedUserId) return <Navigate to="/admin" replace />;

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
    const rows = expenses.filter((e) => {
      const d = e.date.split("T")[0];
      return d >= r.from && d <= r.to;
    });
    heroTotal = sumOut(rows);
    heroIncome = sumIn(rows);
  } else {
    const r = monthRangeOf(monthAnchor);
    heroLabel = "Month total";
    const rows = expenses.filter((e) => {
      const d = e.date.split("T")[0];
      return d >= r.from && d <= r.to;
    });
    heroTotal = sumOut(rows);
    heroIncome = sumIn(rows);
  }
  const heroNet = heroIncome - heroTotal;

  const periodLabel =
    view === "today"
      ? (dayAnchor === today ? "Today"
        : dayAnchor === yesterday ? "Yesterday"
          : dayAnchor === dayBefore ? dayBeforeName
            : new Date(dayAnchor.split("T")[0] + "T00:00:00").toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" }))
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

  const isMaintenanceActive = localStorage.getItem("finlo_config_maintenance") === "true";
  const shouldBlockForMaintenance = isMaintenanceActive && !isAdmin;

  if (shouldBlockForMaintenance) {
    return (
      <main className="min-h-dvh bg-background text-foreground flex flex-col items-center justify-center p-6 select-none animate-in fade-in duration-300">
        <div className="max-w-md w-full text-center space-y-6">
          <div className="mx-auto h-16 w-16 rounded-full bg-amber-500/10 flex items-center justify-center border border-amber-500/20 shadow-[0_0_24px_rgba(245,158,11,0.15)] animate-bounce [animation-duration:2s]">
            <Lock className="h-6 w-6 text-amber-500" strokeWidth={1.5} />
          </div>
          <div className="space-y-2">
            <h1 className="font-serif text-3xl font-normal tracking-tight">Scheduled Maintenance</h1>
            <p className="text-sm text-ink-muted leading-relaxed">
              Finlo is currently undergoing a routine security & system optimization upgrade. We will be back online shortly.
            </p>
          </div>
          <div className="p-4 rounded-2xl bg-surface/40 border border-border/30 text-[11px] text-ink-muted">
            <p className="font-medium text-foreground mb-1">Estimated Completion Time</p>
            <p className="tabular-nums font-mono">Under 45 Minutes</p>
          </div>
          <div className="pt-4 border-t border-border/15">
            <p className="text-[10px] tracking-[0.2em] uppercase text-ink-muted font-bold">
              Finlo Support
            </p>
          </div>
        </div>
      </main>
    );
  }

  // Final safety check: If profile hasn't loaded real data yet
  if (!profile?.user_id && expenseUserId) {
    return (
      <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background select-none pointer-events-auto animate-in fade-in duration-300">
        <div className="flex flex-col items-center justify-center">
          <div className="h-10 w-10 animate-spin rounded-full border-4 border-primary/20 border-t-primary" />
          <p className="text-[10px] tracking-[0.2em] text-ink-muted/40 font-bold uppercase mt-6 animate-pulse">Initializing Security</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {(pullPx > 1 || pullPhase === "refreshing") && (
        <div className="fixed top-0 left-0 right-0 z-[90] pointer-events-none">
          {pullPhase === "refreshing" && (
            <span className="sr-only" role="status">
              Refreshing
            </span>
          )}
          <PullRefreshIndicator phase={pullPhase} pullPx={pullPx} />
        </div>
      )}

      <main
        ref={mainRef}
        className="min-h-dvh bg-background text-foreground font-sans overscroll-y-contain"
        style={{
          transform: pullPx > 0 ? `translateY(${pullPx}px)` : undefined,
          willChange: pullPx > 0 ? "transform" : undefined,
          transition: pullPhase !== "pulling" ? "transform 330ms cubic-bezier(0.2, 0.8, 0.2, 1)" : undefined,
        }}
      >
        {impersonatedUserId && (
          <div className="bg-amber-500 text-amber-950 px-4 py-2.5 text-center text-xs font-semibold flex items-center justify-center gap-2 select-none sticky top-0 z-[60] shadow-md border-b border-amber-600/20">
            <ShieldCheck className="h-4 w-4 shrink-0" />
            <span>You are impersonating <strong>{impersonatedEmail}</strong> (Read-Only Support Session)</span>
            <button
              onClick={() => stopImpersonating()}
              className="bg-amber-950 text-amber-50 rounded-full px-2.5 py-0.5 text-[10px] uppercase font-bold hover:bg-amber-900 transition-colors ml-1"
            >
              Exit Session
            </button>
          </div>
        )}
        {/* Premium Native-Style Animated Splash Screen Loader */}
        {!initialDataReady && expenseUserId && (
          <div className="fixed inset-0 z-[100] flex flex-col items-center justify-center bg-background select-none pointer-events-auto animate-in fade-in duration-300">
            <div className="flex flex-col items-center justify-center">
              <div className="relative">
                <img
                  src="/finlo-logo.png"
                  alt="Finlo"
                  className="h-16 w-16 sm:h-20 sm:w-20 rounded-[22px] object-contain shadow-[0_8px_32px_-8px_rgba(0,0,0,0.2)] animate-pulse"
                  style={{ animationDuration: "1.8s" }}
                />
              </div>
              <h2 className="font-serif text-2xl font-normal text-foreground tracking-tight mt-6 leading-none">
                Finlo AI
              </h2>
              <p className="text-[9px] tracking-[0.25em] text-ink-muted/40 font-bold uppercase mt-2">
                Secure Ledger
              </p>
              <div className="mt-8 flex items-center justify-center gap-1.5 text-ink-muted">
                <div className="h-1.5 w-1.5 rounded-full bg-foreground/30 animate-bounce [animation-delay:-0.3s]" />
                <div className="h-1.5 w-1.5 rounded-full bg-foreground/30 animate-bounce [animation-delay:-0.15s]" />
                <div className="h-1.5 w-1.5 rounded-full bg-foreground/30 animate-bounce" />
              </div>
            </div>
          </div>
        )}

        <InstallAppBanner className="sticky top-0 z-[55]" />


        <div className="px-6 space-y-6">

          <header className={cn("sticky z-40 bg-background/95 backdrop-blur-sm -mx-4 sm:-mx-6 px-4 sm:px-6 pt-3 sm:pt-5 pb-3 mb-6 border-b border-border/40 flex items-center justify-between gap-2 top-[env(safe-area-inset-top,0px)] transition-transform duration-300", scrollDir === "down" ? "-translate-y-full" : "translate-y-0")}>
            <div className="flex items-center gap-2.5 min-w-0">
              <img src="/finlo-logo.png" alt="Finlo" className="h-7 w-7 sm:h-9 sm:w-9 rounded-xl object-contain shrink-0" />
              <div className="min-w-0">
                <div className="flex items-center gap-1.5">
                  <h1 className="font-serif text-lg sm:text-xl text-foreground leading-none truncate">Finlo</h1>
                  <div
                    className={cn(
                      "h-1.5 w-1.5 rounded-full shrink-0 transition-all duration-500",
                      isOnline
                        ? "bg-emerald-500 shadow-[0_0_6px_rgba(16,185,129,0.5)]"
                        : "bg-amber-500 shadow-[0_0_6px_rgba(245,158,11,0.5)] animate-pulse"
                    )}
                    title={isOnline ? "Online & Synced" : "Offline Mode (Changes saved locally)"}
                  />
                </div>
                <p className="hidden sm:block text-[11px] text-ink-muted mt-1 truncate">Hi {profile?.name || "there"}</p>
              </div>
            </div>
            <div className="flex items-center gap-1 shrink-0">
              <nav className="relative flex gap-0.5 bg-surface rounded-full p-1 text-[10px] sm:text-xs mr-1 border border-border/50 overflow-hidden" role="tablist" aria-label="Ledger view">
                {/* Sliding background pill */}
                <div
                  className="absolute top-1 bottom-1 rounded-full bg-background shadow-sm transition-all duration-300 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1.1)]"
                  style={{
                    width: "calc((100% - 8px) / 3)",
                    transform: `translateX(${view === "today" ? "0%"
                        : view === "week" ? "calc(100% + 4px)"
                          : "calc(200% + 8px)"
                      })`
                  }}
                />
                {(["today", "week", "month"] as View[]).map((v) => (
                  <button
                    key={v}
                    type="button"
                    role="tab"
                    aria-selected={view === v}
                    onClick={() => { vibrate(10); setView(v); }}
                    className={cn(
                      "relative z-10 px-2 sm:px-3 py-1 rounded-full uppercase tracking-wider transition-colors duration-200 w-14 sm:w-16 text-center select-none",
                      view === v ? "text-foreground font-semibold" : "text-ink-muted hover:text-foreground"
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

          {profile.household_id && (
            <div className="flex justify-center mb-5 animate-in fade-in slide-in-from-top-2 duration-500">
              <div className="bg-surface/50 backdrop-blur-md p-1 rounded-2xl border border-border/40 flex items-center shadow-sm">
                <button
                  onClick={() => { vibrate(10); setViewMode("personal"); }}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold transition-all duration-300",
                    viewMode === "personal"
                      ? "bg-background text-foreground shadow-sm ring-1 ring-border/20"
                      : "text-ink-muted hover:text-foreground"
                  )}
                >
                  <Lock className={cn("h-3 w-3", viewMode === "personal" ? "text-primary" : "opacity-40")} />
                  Personal
                </button>
                <button
                  onClick={() => { vibrate(10); setViewMode("household"); }}
                  className={cn(
                    "flex items-center gap-1.5 px-4 py-1.5 rounded-xl text-xs font-semibold transition-all duration-300",
                    viewMode === "household"
                      ? "bg-background text-foreground shadow-sm ring-1 ring-border/20"
                      : "text-ink-muted hover:text-foreground"
                  )}
                >
                  <Users className={cn("h-3 w-3", viewMode === "household" ? "text-primary" : "opacity-40")} />
                  Household
                </button>
              </div>
            </div>
          )}

          {profile?.household_id && viewMode === "household" && jointGoals?.map((goal) => {
            let formattedDeadline;
            try {
              formattedDeadline = goal.deadline ? new Date(goal.deadline).toLocaleDateString(undefined, { month: "long", year: "numeric" }) : undefined;
            } catch {
              formattedDeadline = goal.deadline;
            }

            return (
              <div key={goal.id} className="animate-in fade-in slide-in-from-bottom-4 duration-700">
                <JointGoalCard
                  title={goal.title}
                  targetAmount={Number(goal.target_amount)}
                  currentAmount={Number(goal.current_amount)}
                  deadline={formattedDeadline}
                  color={goal.color}
                />
              </div>
            );
          })}

          {profile?.household_id && viewMode === "household" && (!jointGoals || jointGoals.length === 0) && (
            <Card className="p-8 border-dashed border-2 border-border/40 bg-surface/5 text-center space-y-3 rounded-[24px]">
              <div className="mx-auto h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center">
                <Target className="h-6 w-6 text-primary" />
              </div>
              <div className="space-y-1">
                <p className="text-sm font-semibold">No shared goals yet</p>
                <p className="text-xs text-ink-muted leading-relaxed px-4">Start tracking your first joint savings target together.</p>
              </div>
              <Button size="sm" variant="outline" className="rounded-full px-6 border-primary/20 text-primary hover:bg-primary/5">
                Create First Goal
              </Button>
            </Card>
          )}

          <section className="rounded-3xl border border-border/50 bg-card p-5 sm:p-6 mb-6">
            <span className="text-ink-muted text-[10px] tracking-[0.2em] uppercase font-medium block mb-3">
              {heroLabel}
            </span>
            <div className="font-serif text-4xl sm:text-5xl font-normal tracking-tight text-foreground flex items-start max-w-full">
              <span className="text-ink-muted/40 text-xl sm:text-2xl mt-1 mr-1 shrink-0">{getCurrencySymbol()}</span>
              <span className="truncate">{formatINR(heroTotal)}</span>
            </div>
            {(heroIncome > 0 || heroNet !== -heroTotal) && (
              <div className="flex items-center gap-4 text-xs mt-3">
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
            {safeToSpend !== null && (
              <div className="pt-4 mt-4 border-t border-border/40">
                <p className="text-[10px] tracking-[0.2em] uppercase text-ink-muted font-medium mb-1">
                  Safe to spend (month)
                </p>
                <p className="font-serif text-2xl sm:text-3xl text-foreground tabular-nums">
                  {getCurrencySymbol()}{formatINR(safeToSpend)}
                </p>
                <p className="text-[10px] text-ink-muted mt-1 leading-snug">
                  Left across your budgets after spending this month to date
                </p>
              </div>
            )}
          </section>

          <PulseCard
            userId={expenseUserId}
            onNavigate={handlePulseNavigate}
            onAction={handlePulseAction}
          />

          <PeriodNav label={periodLabel} onPrev={onPrev} onNext={onNext} canNext={canNext} />

          {!initialDataReady && expenseUserId ? (
            <div className="space-y-5 py-6" aria-busy="true">
              <Skeleton className="h-24 w-full rounded-3xl" />
              <Skeleton className="h-14 w-full rounded-2xl" />
              <Skeleton className="h-40 w-full rounded-3xl" />
              <Skeleton className="h-32 w-full rounded-2xl" />
            </div>
          ) : (
            <>
              {impersonatedUserId ? (
                <div className="mb-8 p-5 rounded-3xl bg-amber-500/5 border border-amber-500/15 text-center select-none flex flex-col items-center justify-center animate-in fade-in slide-in-from-top-2 duration-300">
                  <ShieldCheck className="h-6 w-6 text-amber-500 mb-2" strokeWidth={1.5} />
                  <p className="text-sm font-semibold text-foreground">Impersonation Sandbox Active</p>
                  <p className="text-xs text-ink-muted/80 mt-1 max-w-sm">
                    You are securely viewing the live budget of <strong>{impersonatedEmail}</strong>. In this support session, transaction writes and category additions are locked.
                  </p>
                  <div className="mt-4 flex items-center gap-2.5">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        stopImpersonating();
                        toast({ title: "Impersonation session ended", description: "You are now back in standard Admin mode." });
                        navigate("/admin");
                      }}
                      className="rounded-full h-8 px-4 text-xs font-medium border-amber-500/20 text-amber-500 hover:bg-amber-500/10"
                    >
                      End Session
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate("/admin")}
                      className="rounded-full h-8 px-4 text-xs font-medium border-border/60 text-foreground hover:bg-surface"
                    >
                      Go to Admin
                    </Button>
                  </div>
                </div>
              ) : (
                <>
                  <div className="mb-6">
                    <p className="text-[10px] tracking-[0.18em] uppercase text-ink-muted font-semibold px-1.5 mb-2">Quick capture</p>
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
                      sharePrefill={sharePrefill}
                      onReceiptScan={(prefill) => {
                        setReceiptScanPrefill(prefill);
                        setEditing(null);
                        setOpen(true);
                      }}
                    />
                  </div>

                  <div className="hidden sm:flex justify-center mb-12">
                    <Button
                      onClick={() => { setEditing(null); setOpen(true); }}
                      className="rounded-full bg-foreground text-background hover:bg-foreground/90 px-7 h-12 text-sm font-medium shadow-md"
                    >
                      <Plus className="h-4 w-4 mr-1" /> Add transaction
                    </Button>
                  </div>
                </>
              )}

              {(owedToMeSum > 0 || iOweSum > 0) && (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={() => setLoansOpen(true)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") setLoansOpen(true);
                  }}
                  className="mb-6 group rounded-2xl border border-border/50 bg-card/80 px-3 py-2.5 sm:px-4 sm:py-3 cursor-pointer hover:bg-surface/50 active:scale-[0.99] transition-[background,transform] duration-150"
                >
                  <div className="flex flex-col gap-2.5 min-[400px]:flex-row min-[400px]:items-center min-[400px]:gap-3">
                    <div className="flex items-center justify-between gap-2 min-[400px]:justify-start min-[400px]:shrink-0">
                      <div className="flex items-center gap-2 text-ink-muted">
                        <HandCoins className="h-4 w-4 text-foreground/70 shrink-0" aria-hidden />
                        <span className="text-[10px] font-medium uppercase tracking-[0.14em]">Loans</span>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-ink-muted/40 group-hover:text-ink-muted/65 transition-colors shrink-0 min-[400px]:hidden" aria-hidden />
                    </div>
                    <div className="flex flex-1 items-stretch min-[400px]:items-center gap-2 min-[400px]:justify-end min-[400px]:min-w-0">
                      <div
                        className={cn(
                          "grid gap-2 flex-1 min-[400px]:flex-none min-[400px]:flex min-[400px]:flex-wrap min-[400px]:justify-end",
                          owedToMeSum > 0 && iOweSum > 0 ? "grid-cols-2" : "grid-cols-1",
                        )}
                      >
                        {owedToMeSum > 0 && (
                          <div className="min-w-0 rounded-xl bg-emerald-500/5 dark:bg-emerald-500/10 px-2.5 py-1.5 sm:px-3 sm:py-2 min-[400px]:text-right">
                            <p className="text-[9px] uppercase tracking-wider text-ink-muted/90">In</p>
                            <p className="font-serif text-sm sm:text-base text-emerald-600 dark:text-emerald-400 tabular-nums font-medium leading-tight truncate">
                              +{getCurrencySymbol()}{formatINR(owedToMeSum)}
                            </p>
                          </div>
                        )}
                        {iOweSum > 0 && (
                          <div className="min-w-0 rounded-xl bg-destructive/5 px-2.5 py-1.5 sm:px-3 sm:py-2 min-[400px]:text-right">
                            <p className="text-[9px] uppercase tracking-wider text-ink-muted/90">Out</p>
                            <p className="font-serif text-sm sm:text-base text-destructive tabular-nums font-medium leading-tight truncate">
                              −{getCurrencySymbol()}{formatINR(iOweSum)}
                            </p>
                          </div>
                        )}
                      </div>
                      <ChevronRight className="hidden min-[400px]:block h-4 w-4 text-ink-muted/35 group-hover:text-ink-muted/60 transition-colors shrink-0 self-center" aria-hidden />
                    </div>
                  </div>
                </div>
              )}

              {reimbursablesSummary.pendingSum > 0 && (
                <div
                  role="button"
                  tabIndex={0}
                  onClick={handleOpenReimbursables}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") handleOpenReimbursables();
                  }}
                  className="mb-6 group rounded-2xl border border-border/50 bg-card/80 px-3 py-2.5 sm:px-4 sm:py-3 cursor-pointer hover:bg-surface/50 active:scale-[0.99] transition-[background,transform] duration-150"
                >
                  <div className="flex flex-col gap-2.5 min-[400px]:flex-row min-[400px]:items-center min-[400px]:gap-3">
                    <div className="flex items-center justify-between gap-2 min-[400px]:justify-start min-[400px]:shrink-0">
                      <div className="flex items-center gap-2 text-ink-muted">
                        <ArrowLeftRight className="h-4 w-4 text-foreground/70 shrink-0" aria-hidden />
                        <span className="text-[10px] font-medium uppercase tracking-[0.14em]">Reimbursements</span>
                      </div>
                      <ChevronRight className="h-3.5 w-3.5 text-ink-muted/40 group-hover:text-ink-muted/65 transition-colors shrink-0 min-[400px]:hidden" aria-hidden />
                    </div>
                    <div className="flex flex-1 items-stretch min-[400px]:items-center gap-2 min-[400px]:justify-end min-[400px]:min-w-0">
                      <div className="grid gap-2 flex-1 min-[400px]:flex-none min-[400px]:flex min-[400px]:flex-wrap min-[400px]:justify-end grid-cols-1">
                        <div className="min-w-0 rounded-xl bg-amber-500/5 dark:bg-amber-500/10 px-2.5 py-1.5 sm:px-3 sm:py-2 min-[400px]:text-right flex items-center justify-between min-[400px]:block gap-4">
                          <p className="text-[9px] uppercase tracking-wider text-ink-muted/90 leading-none min-[400px]:mb-1">Pending payback</p>
                          <p className="font-serif text-sm sm:text-base text-amber-600 dark:text-amber-400 tabular-nums font-medium leading-tight truncate">
                            {getCurrencySymbol()}{formatINR(reimbursablesSummary.pendingSum)}
                          </p>
                        </div>
                      </div>
                      <ChevronRight className="hidden min-[400px]:block h-4 w-4 text-ink-muted/35 group-hover:text-ink-muted/60 transition-colors shrink-0 self-center" aria-hidden />
                    </div>
                  </div>
                </div>
              )}

              <div
                className="relative min-h-[250px] touch-pan-y"
                onTouchStart={handleTouchStart}
                onTouchEnd={handleTouchEnd}
              >
                {view === "today" && (
                  <section>
                    <h3 className="text-ink-muted/80 text-[10px] tracking-[0.2em] uppercase font-medium mb-4">
                      {dayExpenses.length === 0 ? "Nothing logged" : "Recorded"}
                    </h3>
                    {dayExpenses.length === 0 ? (
                      <div className="flex flex-col items-center justify-center py-12 px-6 bg-surface/30 rounded-[32px] border border-dashed border-border/60">
                        <div className="h-12 w-12 rounded-full bg-surface flex items-center justify-center mb-4">
                          <Plus className="h-6 w-6 text-ink-muted/40" />
                        </div>
                        <p className="text-center text-foreground text-sm font-medium">
                          No {viewMode === "household" ? "shared" : ""} entries for this day
                        </p>
                        <p className="text-center text-ink-muted text-xs mt-1 max-w-[200px]">
                          Tap <span className="text-foreground font-medium">Add transaction</span> to start tracking your {viewMode === "household" ? "shared" : ""} cash flow.
                        </p>
                      </div>
                    ) : (
                      <div className="flex flex-col divide-y divide-border/50">
                        {dayExpenses.map((e) => (
                          <ExpenseRow
                            key={e.id} expense={e} onSelect={setDetails}
                            onDelete={() => handleAskDelete(e)}
                            categories={categories}
                            showAnomaly={anomalyExpenseIds.has(e.id)}
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
                                      <ExpenseRow
                                        key={e.id}
                                        expense={e}
                                        onSelect={setDetails}
                                        categories={categories}
                                        showAnomaly={anomalyExpenseIds.has(e.id)}
                                        currentUserId={user?.id}
                                        onToggleReaction={toggleReaction}
                                      />
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
                  <WeeklyView
                    expenses={expenses}
                    categories={categories}
                    anchor={weekAnchor}
                    onSelect={setDetails}
                    anomalyExpenseIds={anomalyExpenseIds}
                    currentUserId={user?.id}
                    onToggleReaction={toggleReaction}
                  />
                )}

                {view === "month" && (
                  <MonthlyView
                    expenses={expenses} budgets={budgets}
                    onOpenBudgets={() => setBudgetsOpen(true)}
                    anchor={monthAnchor} onSelect={setDetails} categories={categories}
                    anomalyExpenseIds={anomalyExpenseIds}
                    currentUserId={user?.id}
                    onToggleReaction={toggleReaction}
                  />
                )}
              </div>
            </>
          )}
        </div>

        <AddExpenseSheet
          open={open} onOpenChange={(v) => { setOpen(v); if (!v) { setEditing(null); clearReceiptPrefill(); } }}
          categories={categories} onAdd={handleAddExpense}
          onAddCategory={addCategory} onAddSubcategory={addSubcategory}
          editing={editing} onUpdate={handleUpdateExpense}
          isHouseholdMember={!!profile.household_id}
          defaultShared={viewMode === "household"}
          budgets={budgets} spentByCategory={spentByCategory}
          receiptScanPrefill={receiptScanPrefill}
          onReceiptScanPrefillConsumed={clearReceiptPrefill}
          defaultDate={view === "today" ? dayAnchor : todayISO()}
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
          onUpdate={handleUpdateExpense} onDelete={deleteExpense}
          onAddSubcategory={addSubcategory}
          userId={user?.id ?? null}
          onToggleReaction={toggleReaction}
        />

        <BudgetsSheet
          open={budgetsOpen} onOpenChange={setBudgetsOpen}
          categories={categories} budgets={budgets}
          spentByCategory={spentByCategory} onSetBudget={setBudget}
        />

        <ImportSheet open={importOpen} onOpenChange={setImportOpen} onImport={importExpenses} />

        <RecurringSheet open={recurringOpen} onOpenChange={setRecurringOpen}
          categories={categories} userId={user?.id ?? null} />

        <SubscriptionsSheet open={subscriptionsOpen} onOpenChange={setSubscriptionsOpen}
          categories={categories} userId={user?.id ?? null} expenses={expenses} />

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
          onOpenSubscriptions={() => setSubscriptionsOpen(true)}
          onOpenLoans={() => setLoansOpen(true)}
          onOpenTrash={() => setTrashOpen(true)}
          profile={profile} onUpdateProfile={updateProfile}
          theme={theme} onUpdateTheme={updateTheme}
          onLogout={logout}
          onSync={sync} syncing={syncing} lastSync={lastSync} pendingCount={pendingCount}
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
                <span className="text-foreground">Refresh data</span>
                <span className="text-xs text-ink-muted font-medium text-right">Pull down on the home screen (mobile)</span>
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

        {/* Mobile bottom navigation — Adaptive Floating Dock */}
        {!askAIOpen && !details && (
          <div
            className={cn(
              "fixed z-[var(--finlo-z-mobile-nav,60)] bottom-0 inset-x-0 md:hidden flex justify-center pointer-events-none transition-all duration-500 ease-out-soft",
              scrollDir === "down" ? "translate-y-24 opacity-0 scale-90" : "translate-y-0 opacity-100 scale-100"
            )}
            style={{ paddingBottom: "calc(env(safe-area-inset-bottom, 0px) + 20px)" }}
          >
            <div className={cn(
              "backdrop-blur-2xl border transition-all duration-500 shadow-2xl rounded-full flex items-center justify-between px-2 py-1.5 pointer-events-auto w-[calc(100%-2.5rem)] max-w-[340px]",
              isScrolled 
                ? "bg-background/80 border-border/40 shadow-[0_20px_50px_rgba(0,0,0,0.3)]" 
                : "bg-background/95 border-border/80 shadow-[0_8px_32px_rgba(0,0,0,0.1)]"
            )}>
              <button
                onClick={() => {
                  vibrate(10);
                  setSettingsOpen(false);
                  setLoansOpen(false);
                  setBudgetsOpen(false);
                  setSearchOpen(false);
                  setImportOpen(false);
                  setRecurringOpen(false);
                  setTrashOpen(false);
                  setDetails(null);
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                className={cn(
                  "flex items-center justify-center p-3 rounded-full hover:bg-surface/60 active:scale-95 transition-all",
                  (!budgetsOpen && !loansOpen && !settingsOpen && !recurringOpen && !trashOpen && !importOpen)
                    ? "text-foreground bg-surface/45"
                    : "text-ink-muted hover:text-foreground"
                )}
                aria-label="Home"
                title="Home"
              >
                <Home className="h-[22px] w-[22px]" strokeWidth={2.25} />
              </button>

              <button
                onClick={() => {
                  vibrate(10);
                  setSettingsOpen(false);
                  setLoansOpen(false);
                  setSearchOpen(false);
                  setImportOpen(false);
                  setRecurringOpen(false);
                  setTrashOpen(false);
                  setDetails(null);
                  setBudgetsOpen(true);
                }}
                className={cn(
                  "flex items-center justify-center p-3 rounded-full hover:bg-surface/60 active:scale-95 transition-all",
                  budgetsOpen ? "text-foreground bg-surface/45" : "text-ink-muted hover:text-foreground"
                )}
                aria-label="Budgets"
                title="Budgets"
              >
                <Wallet className="h-[22px] w-[22px]" strokeWidth={2.25} />
              </button>

              {/* Center FAB */}
              {!impersonatedUserId && (
                <button
                  type="button"
                  {...expenseAI.fabPointerProps}
                  className={cn(
                    "relative isolate h-12 w-12 shrink-0 overflow-hidden rounded-full mx-1",
                    "flex items-center justify-center",
                    "bg-foreground text-background",
                    "shadow-[0_4px_12px_-4px_hsl(var(--foreground)/0.3)]",
                    "transition-all duration-300 [transition-timing-function:cubic-bezier(0.34,1.56,0.64,1)] cursor-pointer active:scale-[0.96]",
                    "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-foreground focus-visible:ring-offset-2",
                    expenseAI.isListening &&
                    "scale-105 bg-rose-500 text-white shadow-[0_0_0_4px_rgba(244,114,182,0.2)]"
                  )}
                  aria-label="Add transaction. Press and hold to log by voice."
                  title="Tap to add. Hold for voice."
                >
                  <Plus className="relative z-10 h-6 w-6 stroke-[2.5]" />
                </button>
              )}

              <button
                onClick={() => {
                  vibrate(10);
                  setSettingsOpen(false);
                  setBudgetsOpen(false);
                  setSearchOpen(false);
                  setImportOpen(false);
                  setRecurringOpen(false);
                  setTrashOpen(false);
                  setDetails(null);
                  setLoansOpen(true);
                }}
                className={cn(
                  "flex items-center justify-center p-3 rounded-full hover:bg-surface/60 active:scale-95 transition-all",
                  loansOpen ? "text-foreground bg-surface/45" : "text-ink-muted hover:text-foreground"
                )}
                aria-label="Loans"
                title="Loans"
              >
                <ArrowLeftRight className="h-[22px] w-[22px]" strokeWidth={2.25} />
              </button>

              <button
                onClick={() => {
                  vibrate(10);
                  setLoansOpen(false);
                  setBudgetsOpen(false);
                  setSearchOpen(false);
                  setImportOpen(false);
                  setRecurringOpen(false);
                  setTrashOpen(false);
                  setDetails(null);
                  setSettingsOpen(true);
                }}
                className={cn(
                  "flex items-center justify-center p-3 rounded-full hover:bg-surface/60 active:scale-95 transition-all",
                  settingsOpen ? "text-foreground bg-surface/45" : "text-ink-muted hover:text-foreground"
                )}
                aria-label="Settings"
                title="Settings"
              >
                <SettingsIcon className="h-[22px] w-[22px]" strokeWidth={2.25} />
              </button>
            </div>
          </div>
        )}

        {/* Desktop / tablet: floating add (mobile uses bottom bar FAB) */}
        {!impersonatedUserId && (
          <button
            type="button"
            onClick={() => {
              setEditing(null);
              setOpen(true);
            }}
            className={cn(
              "hidden md:flex fixed z-50 items-center justify-center",
              "bottom-8 right-8 h-14 w-14 rounded-full",
              "bg-foreground text-background shadow-lg",
              "hover:bg-foreground/90 active:scale-95 transition-transform",
              "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-400/55 focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            )}
            style={{
              marginBottom: "max(1.5rem, env(safe-area-inset-bottom, 0px))",
            }}
            aria-label="Add transaction"
            title="Add transaction"
          >
            <Plus className="h-6 w-6" strokeWidth={2.25} />
          </button>
        )}
      </main>
    </>
  );
};

export default Index;
