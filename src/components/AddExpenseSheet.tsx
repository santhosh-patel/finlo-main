import { useEffect, useMemo, useRef, useState, useCallback } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn, vibrate } from "@/lib/utils";
import {
  CategoryDef,
  Expense,
  getCurrencySymbol,
  PAYMENT_METHODS,
  PaymentMethod,
  formatINR,
  todayISO,
  TxnType,
  INCOME_CATEGORIES,
} from "@/lib/expenses";
import { SUPPORTED_CURRENCIES, CURRENCY_SYMBOLS, getBaseCurrency, getFxRateSync, refreshFxRates } from "@/lib/fx";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Plus, AlertCircle, Camera, Loader2, Sparkles } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { RollingDatePicker } from "./RollingDatePicker";

export type ReceiptScanPrefill = {
  amount?: number;
  merchant?: string;
  date?: string;
  categoryGuess?: string;
};

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categories: CategoryDef[];
  onAdd: (e: Omit<Expense, "id" | "created_at">) => void;
  onAddCategory: (name: string) => void;
  onAddSubcategory?: (category: string, sub: string) => void;
  editing?: Expense | null;
  onUpdate?: (id: string, patch: Partial<Omit<Expense, "id" | "created_at">>) => void;
  budgets?: Record<string, number>;
  spentByCategory?: Record<string, number>;
  /** From quick-add receipt scan: applied when sheet opens (add mode only) */
  receiptScanPrefill?: ReceiptScanPrefill | null;
  onReceiptScanPrefillConsumed?: () => void;
  defaultDate?: string;
  isHouseholdMember?: boolean;
  defaultShared?: boolean;
}

export function AddExpenseSheet({ 
  open, onOpenChange, categories, onAdd, onAddCategory, onAddSubcategory, editing, onUpdate,
  budgets = {}, spentByCategory = {},
  receiptScanPrefill = null,
  onReceiptScanPrefillConsumed,
  defaultDate,
  isHouseholdMember = false,
  defaultShared = false,
}: Props) {
  const isEdit = !!editing;
  const [txnType, setTxnType] = useState<TxnType>("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>(categories[0]?.name ?? "Food");
  const [subcategory, setSubcategory] = useState<string>("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayISO());
  const [payment, setPayment] = useState<PaymentMethod>("upi");
  const baseCurrency = getBaseCurrency();
  const [currency, setCurrency] = useState<string>(baseCurrency);
  const [reimbursable, setReimbursable] = useState(false);
  const [newCat, setNewCat] = useState("");
  const [showAddCat, setShowAddCat] = useState(false);
  const [newSub, setNewSub] = useState("");
  const [showAddSub, setShowAddSub] = useState(false);
  const [errors, setErrors] = useState<{ amount?: string; category?: string; date?: string }>({});
  const [submitted, setSubmitted] = useState(false);
  const [subSearch, setSubSearch] = useState("");

  const [isProcessingReceipt, setIsProcessingReceipt] = useState(false);
  const [isSuggestingCategory, setIsSuggestingCategory] = useState(false);
  const [isShared, setIsShared] = useState(defaultShared);
  const [receiptUrl, setReceiptUrl] = useState("");

  const fileInputRef = useRef<HTMLInputElement>(null);

  const isIncomeCategory = useCallback((catName: string) => 
    ["salary", "freelance", "refund", "other income"].includes(catName.toLowerCase()) || catName.toLowerCase().includes("income"), []);

  const activeCategories = useMemo(() => {
    if (txnType === "income") {
      return categories.filter(c => c.type === "income" || isIncomeCategory(c.name));
    } else {
      return categories.filter(c => c.type !== "income" && !isIncomeCategory(c.name));
    }
  }, [categories, txnType, isIncomeCategory]);
  const amountRef = useRef<HTMLInputElement>(null);
  
  const budgetLimit = budgets[category] || 0;
  const currentSpent = spentByCategory[category] || 0;
  const draftAmount = parseFloat(amount) || 0;
  
  // If editing, we subtract the original amount from currentSpent to get the status
  const adjustedSpent = isEdit && editing?.category === category 
    ? Math.max(0, currentSpent - editing.amount) 
    : currentSpent;
    
  const totalWithDraft = adjustedSpent + draftAmount;
  const isOverBudget = budgetLimit > 0 && totalWithDraft > budgetLimit;
  const isCloseToBudget = budgetLimit > 0 && !isOverBudget && totalWithDraft > (budgetLimit * 0.8);

  const subs = useMemo(
    () => activeCategories.find((c) => c.name === category)?.subcategories ?? [],
    [category, activeCategories]
  );

  const filteredSubs = useMemo(() => {
    if (!subSearch.trim()) return subs;
    return subs.filter(s => s.toLowerCase().includes(subSearch.toLowerCase()));
  }, [subs, subSearch]);

  const normalizedDate = useMemo(() => date.trim().split("T")[0], [date]);

  const validate = useCallback((): typeof errors => {
    const errs: typeof errors = {};
    const num = parseFloat(amount);
    if (!amount.trim()) errs.amount = "Amount is required.";
    else if (Number.isNaN(num)) errs.amount = "Enter a valid number.";
    else if (num <= 0) errs.amount = "Amount must be greater than zero.";
    else if (num > 10_000_000) errs.amount = "Amount looks too large.";
    if (!category.trim()) errs.category = "Pick a category.";
    if (!normalizedDate) errs.date = "Date is required.";
    else if (normalizedDate > todayISO()) errs.date = "Date can't be in the future.";
    return errs;
  }, [amount, category, normalizedDate]);

  const commitNewCategory = useCallback(() => {
    const v = newCat.trim();
    if (!v) return;
    onAddCategory(v);
    setCategory(v);
    setNewCat("");
    setShowAddCat(false);
  }, [newCat, onAddCategory]);

  const commitNewSubcategory = useCallback(() => {
    if (!onAddSubcategory) return;
    const v = newSub.trim();
    if (!v) return;
    onAddSubcategory(category, v);
    setSubcategory(v.toLowerCase());
    setNewSub("");
    setShowAddSub(false);
  }, [newSub, onAddSubcategory, category]);

  // Reset form when the sheet opens or the edited row changes — not when `categories` updates
  // (adding a category would otherwise reset fields and could confuse navigation / history).
  useEffect(() => {
    if (!open) return undefined;
    setSubSearch("");
    if (editing) {
      setTxnType(editing.type ?? "expense");
      setAmount(String(editing.amount));
      setCategory(editing.category);
      setSubcategory(editing.subcategory ?? "");
      setNote(editing.note ?? "");
      setDate(editing.date);
      setPayment(editing.payment_method);
      setCurrency(editing.currency ?? baseCurrency);
      setReimbursable(!!editing.is_reimbursable);
      setIsShared(editing.household_id !== null);
    setReceiptUrl(editing.receipt_url ?? "");
    } else {
      setTxnType("expense");
      setAmount("");
      setCategory(categories[0]?.name ?? "Food");
      setSubcategory("");
      setNote("");
      setDate(defaultDate || todayISO());
      setPayment("upi");
      setCurrency(baseCurrency);
      setReimbursable(false);
      setIsShared(defaultShared);
      setReceiptUrl("");
    }
    refreshFxRates(baseCurrency);
    setShowAddCat(false);
    setNewCat("");
    setErrors({});
    setSubmitted(false);
    const focusTimer = window.setTimeout(() => amountRef.current?.focus(), 80);
    return () => window.clearTimeout(focusTimer);
  }, [open, editing?.id, baseCurrency]);

  useEffect(() => {
    if (!open || editing || !receiptScanPrefill) return;
    if (receiptScanPrefill.amount != null && receiptScanPrefill.amount > 0) {
      setAmount(String(receiptScanPrefill.amount));
    }
    if (receiptScanPrefill.merchant) setNote(receiptScanPrefill.merchant);
    if (receiptScanPrefill.date && /^\d{4}-\d{2}-\d{2}$/.test(receiptScanPrefill.date)) {
      setDate(receiptScanPrefill.date);
    }
    if (receiptScanPrefill.categoryGuess) {
      const g = receiptScanPrefill.categoryGuess;
      const matched = categories.find((c) => c.name.toLowerCase() === g.toLowerCase());
      if (matched) setCategory(matched.name);
      else {
        const loose = categories.find((c) => g.toLowerCase().includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(g.toLowerCase()));
        if (loose) setCategory(loose.name);
      }
    }
    setTxnType("expense");
    onReceiptScanPrefillConsumed?.();
  }, [open, editing, receiptScanPrefill, categories, onReceiptScanPrefillConsumed]);

  // Live revalidation after first submit attempt
  useEffect(() => {
    if (submitted) setErrors(validate());
  }, [amount, category, date, submitted, validate]);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    setSubmitted(true);
    const errs = validate();
    setErrors(errs);
    if (Object.keys(errs).length > 0) {
      if (errs.amount) amountRef.current?.focus();
      return;
    }
    const num = parseFloat(amount);
    const fxRate = currency === baseCurrency ? 1 : getFxRateSync(currency, baseCurrency);
    const payload = {
      amount: num,
      category,
      subcategory: subcategory || undefined,
      note: note.trim() || undefined,
      date: normalizedDate,
      payment_method: payment,
      type: txnType,
      currency,
      fx_rate: fxRate,
      base_amount: num * fxRate,
      is_reimbursable: txnType === "expense" ? reimbursable : false,
      receipt_url: receiptUrl || undefined,
    };
    if (isEdit && editing && onUpdate) {
      onUpdate(editing.id, payload);
      vibrate([30, 50, 30]); // Success vibration
    } else {
      onAdd(payload);
      vibrate(35);
    }
    onOpenChange(false);
  };

  const handleReceiptUploadClick = () => {
    fileInputRef.current?.click();
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsProcessingReceipt(true);
    vibrate(); // Gentle tactile tap

    try {
      // 1. Convert to Base64
      const reader = new FileReader();
      reader.onloadend = async () => {
        const base64String = (reader.result as string).split(",")[1];
        
        try {
          // Upload to Supabase Storage
          const fileExt = file.name.split(".").pop();
          const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 7)}.${fileExt}`;
          
          supabase.storage
            .from("receipts")
            .upload(fileName, file)
            .then(({ data: uploadData, error: uploadError }) => {
              if (!uploadError && uploadData) {
                const { data: publicData } = supabase.storage
                  .from("receipts")
                  .getPublicUrl(uploadData.path);
                if (publicData?.publicUrl) {
                  setReceiptUrl(publicData.publicUrl);
                }
              }
            })
            .catch(err => console.error("Optional upload storage err:", err));

          const expenseOnly = activeCategories.map((c) => c.name);
          const { data, error } = await supabase.functions.invoke("parse-receipt", {
            body: {
              imageBase64: base64String,
              contentType: file.type,
              referenceDate: date,
              expenseCategories: expenseOnly,
            },
          });

          if (error) throw error;

          if (data) {
            if (data.amount) setAmount(String(data.amount));
            if (data.merchant) setNote(data.merchant);
            if (data.date) setDate(data.date);
            if (data.category_guess) {
              const g = String(data.category_guess);
              const matched = activeCategories.find((c) => c.name.toLowerCase() === g.toLowerCase())
                ?? activeCategories.find((c) => g.toLowerCase().includes(c.name.toLowerCase()) || c.name.toLowerCase().includes(g.toLowerCase()));
              setCategory(matched?.name ?? activeCategories[0]?.name ?? "Food");
            }
            vibrate([40, 60]); // Successful double vibration
          }
        } catch (err) {
          console.error("AI receipt parser failed:", err);
        } finally {
          setIsProcessingReceipt(false);
        }
      };
      reader.readAsDataURL(file);
    } catch (err) {
      console.error("File parsing error:", err);
      setIsProcessingReceipt(false);
    }
  };

  // Real-time Auto-categorization
  useEffect(() => {
    if (!open || isEdit || !note.trim() || txnType !== "expense") return;

    const timer = setTimeout(async () => {
      setIsSuggestingCategory(true);
      try {
        const { data, error } = await supabase.functions.invoke("suggest-category", {
          body: { note, categories: categories.map(c => c.name) }
        });
        if (!error && data?.category) {
          const matched = categories.find(c => c.name.toLowerCase() === data.category.toLowerCase());
          if (matched && matched.name !== category) {
            setCategory(matched.name);
            vibrate(); // Gentle tactile feedback
          }
        }
      } catch (err) {
        console.error("Auto recommendation category failed:", err);
      } finally {
        setIsSuggestingCategory(false);
      }
    }, 1200); // 1.2s debounce to avoid over-calling the AI while typing

    return () => clearTimeout(timer);
  }, [note, txnType, categories, open, isEdit]);


  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="bg-background border-border rounded-t-[32px] max-h-[92vh] overflow-y-auto"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="font-serif text-3xl font-normal text-foreground">
            {isEdit ? "Edit entry" : "New entry"}
          </SheetTitle>
        </SheetHeader>

        <form onSubmit={submit} className="mt-6 space-y-8 pb-8 max-md:pb-[var(--finlo-mobile-tab-clearance)]">
          {/* Type toggle */}
          <div className="flex p-1 rounded-full bg-surface/60 border border-border/40">
            {(["expense", "income"] as TxnType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  if (t === txnType) return;
                  setTxnType(t);
                  const list = t === "income"
                    ? categories.filter(c => c.type === "income" || ["salary", "freelance", "refund", "other income"].includes(c.name.toLowerCase()))
                    : categories.filter(c => c.type !== "income" && !["salary", "freelance", "refund", "other income"].includes(c.name.toLowerCase()));
                  setCategory(list[0]?.name ?? "");
                  setSubcategory("");
                }}
                className={cn(
                  "flex-1 px-4 py-2 rounded-full text-sm font-medium capitalize transition-colors",
                  txnType === t
                    ? t === "income"
                      ? "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400"
                      : "bg-foreground text-background"
                    : "text-ink-muted"
                )}
              >
                {t}
              </button>
            ))}
          </div>

          {/* Amount */}
          <div
            className={cn(
              "bg-surface/60 rounded-3xl p-6 border",
              errors.amount ? "border-destructive/60" : "border-border/40"
            )}
          >
            <div className="flex items-center gap-3">
              <span className="font-serif text-4xl text-ink-muted/60">{CURRENCY_SYMBOLS[currency] ?? currency}</span>
              <Input
                ref={amountRef}
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                aria-invalid={!!errors.amount}
                aria-describedby={errors.amount ? "amount-error" : undefined}
                className="font-serif text-5xl h-16 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 placeholder:text-ink-muted/30 text-foreground flex-1 min-w-0"
              />
              <div className="flex items-center gap-1.5 shrink-0">
                <button
                  type="button"
                  onClick={handleReceiptUploadClick}
                  className="h-9 w-9 rounded-full border border-border/80 bg-surface/80 flex items-center justify-center hover:bg-surface text-ink-muted hover:text-foreground active:scale-95 transition-all"
                  title="Scan Receipt with AI"
                >
                  <Camera className="h-4 w-4" />
                </button>
                <input
                  type="file"
                  accept="image/*,application/pdf"
                  capture="environment"
                  className="hidden"
                  ref={fileInputRef}
                  onChange={handleFileChange}
                />
                
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className="h-9 w-[88px] rounded-full border-border bg-background/60 text-xs font-medium uppercase tracking-wider">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent className="bg-popover">
                    {SUPPORTED_CURRENCIES.map((c) => (
                      <SelectItem key={c} value={c} className="text-xs">
                        {CURRENCY_SYMBOLS[c]} {c}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            {currency !== baseCurrency && parseFloat(amount) > 0 && (
              <p className="text-[11px] text-ink-muted mt-2">
                ≈ {getCurrencySymbol()}{formatINR(parseFloat(amount) * getFxRateSync(currency, baseCurrency))} {baseCurrency}
                <span className="opacity-60"> · 1 {currency} = {getFxRateSync(currency, baseCurrency).toFixed(4)} {baseCurrency}</span>
              </p>
            )}
            {errors.amount && (
              <p id="amount-error" className="text-xs text-destructive mt-2" role="alert">
                {errors.amount}
              </p>
            )}
            
            {txnType === "expense" && budgetLimit > 0 && (draftAmount > 0 || isEdit) && (
              <div className={cn(
                "mt-3 flex items-center gap-2 text-[11px] font-medium px-2 py-1.5 rounded-lg transition-colors",
                isOverBudget ? "text-destructive bg-destructive/5" : 
                isCloseToBudget ? "text-amber-600 bg-amber-50" : "text-ink-muted/60"
              )}>
                <AlertCircle className="h-3 w-3" />
                {isOverBudget ? (
                  <span>Over budget by {getCurrencySymbol()}{formatINR(totalWithDraft - budgetLimit)}</span>
                ) : isCloseToBudget ? (
                  <span>{getCurrencySymbol()}{formatINR(budgetLimit - totalWithDraft)} left before limit</span>
                ) : (
                  <span>{getCurrencySymbol()}{formatINR(budgetLimit - totalWithDraft)} remaining in budget</span>
                )}
              </div>
            )}

            <div className="relative mt-4">
              <Input
                type="text"
                maxLength={120}
                value={note}
                onChange={(e) => setNote(e.target.value)}
                placeholder="Add a note…"
                className="border-0 border-b border-border rounded-none bg-transparent px-0 pr-6 text-base text-foreground placeholder:text-ink-muted shadow-none focus-visible:ring-0 focus-visible:border-foreground"
              />
              {isSuggestingCategory && (
                <div className="absolute right-0 top-1/2 -translate-y-1/2 flex items-center justify-center animate-pulse">
                  <Sparkles className="h-3.5 w-3.5 text-amber-500 animate-spin" style={{ animationDuration: '3s' }} />
                </div>
              )}
            </div>
          </div>

          {/* Categories */}
          <div className="space-y-3">
            <Label className="text-[10px] tracking-[0.2em] uppercase text-ink-muted font-medium">
              Category
            </Label>
            <div className="flex flex-wrap gap-2">
              {activeCategories.map((c) => (
                <button
                  key={c.name}
                  type="button"
                  onClick={() => {
                    setCategory(c.name);
                    setSubcategory("");
                  }}
                  className={cn(
                    "px-4 py-2 rounded-full text-sm transition-colors border",
                    category === c.name
                      ? "bg-wash-sage border-wash-sage text-foreground font-medium"
                      : "border-border text-ink-muted hover:bg-surface"
                  )}
                >
                  {c.name}
                </button>
              ))}
              {!showAddCat ? (
                <button
                  type="button"
                  onClick={() => setShowAddCat(true)}
                  className="px-3 py-2 rounded-full text-sm border border-dashed border-border text-ink-muted hover:bg-surface inline-flex items-center gap-1"
                >
                  <Plus className="h-3.5 w-3.5" /> New
                </button>
              ) : (
                <div className="inline-flex items-center gap-2">
                  <Input
                    autoFocus
                    value={newCat}
                    onChange={(e) => setNewCat(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key !== "Enter") return;
                      e.preventDefault();
                      commitNewCategory();
                    }}
                    placeholder="Category name"
                    maxLength={24}
                    className="h-9 rounded-full bg-transparent border-border text-sm w-40"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={commitNewCategory}
                  >
                    Add
                  </Button>
                </div>
              )}
            </div>
            {errors.category && (
              <p className="text-xs text-destructive" role="alert">{errors.category}</p>
            )}
          </div>

          {/* Subcategory */}
          {(subs.length > 0 || onAddSubcategory) && (
            <div className="space-y-3">
              <Label className="text-[10px] tracking-[0.2em] uppercase text-ink-muted font-medium">
                Subcategory <span className="opacity-60 normal-case tracking-normal">(optional)</span>
              </Label>
              {subs.length > 8 && (
                <div className="relative mb-2">
                  <Input 
                    value={subSearch}
                    onChange={(e) => setSubSearch(e.target.value)}
                    placeholder="Search subcategories..."
                    className="h-8 rounded-full bg-surface/40 border-border text-xs pl-8"
                  />
                  <Plus className="absolute left-3 top-1/2 -translate-y-1/2 h-3 w-3 text-ink-muted rotate-45" />
                </div>
              )}
              <div className="flex flex-wrap gap-2 max-h-32 overflow-y-auto custom-scrollbar p-1">
                {filteredSubs.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => setSubcategory(subcategory === s ? "" : s)}
                    className={cn(
                      "px-3 py-1.5 rounded-full text-xs transition-colors border capitalize",
                      subcategory === s
                        ? "bg-foreground text-background border-foreground"
                        : "border-border text-ink-muted hover:bg-surface"
                    )}
                  >
                    {s}
                  </button>
                ))}
                {onAddSubcategory && !showAddSub && (
                  <button
                    type="button"
                    onClick={() => setShowAddSub(true)}
                    className="px-3 py-1.5 rounded-full text-xs border border-dashed border-border text-ink-muted hover:bg-surface inline-flex items-center gap-1"
                  >
                    <Plus className="h-3 w-3" /> New
                  </button>
                )}
                {onAddSubcategory && showAddSub && (
                  <div className="inline-flex items-center gap-2">
                    <Input
                      autoFocus
                      value={newSub}
                      onChange={(e) => setNewSub(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key !== "Enter") return;
                        e.preventDefault();
                        commitNewSubcategory();
                      }}
                      placeholder="Subcategory"
                      maxLength={20}
                      className="h-8 rounded-full bg-transparent border-border text-xs w-32"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={commitNewSubcategory}
                    >
                      Add
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Payment + date */}
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-3">
              <Label className="text-[10px] tracking-[0.2em] uppercase text-ink-muted font-medium">
                Payment
              </Label>
              <div className="flex gap-2">
                {PAYMENT_METHODS.map((p) => (
                  <button
                    key={p.value}
                    type="button"
                    onClick={() => setPayment(p.value)}
                    className={cn(
                      "flex-1 px-3 py-2 rounded-full text-xs uppercase tracking-wider border transition-colors",
                      payment === p.value
                        ? "bg-foreground text-background border-foreground"
                        : "border-border text-ink-muted hover:bg-surface"
                    )}
                  >
                    {p.label}
                  </button>
                ))}
              </div>
            </div>
            <div className="space-y-3">
              <Label htmlFor="date" className="text-[10px] tracking-[0.2em] uppercase text-ink-muted font-medium">
                Date
              </Label>
              <RollingDatePicker
                value={date}
                max={todayISO()}
                showTime={false}
                onChange={(val) => setDate(val)}
                className={errors.date ? "border-destructive focus-visible:ring-destructive" : ""}
              />
              {errors.date && (
                <p className="text-xs text-destructive" role="alert">{errors.date}</p>
              )}
            </div>
          </div>

          {txnType === "expense" && (
            <div className="space-y-3">
              <button
                type="button"
                onClick={() => setReimbursable((v) => !v)}
                className={cn(
                  "w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border text-left transition-colors",
                  reimbursable
                    ? "border-emerald-500/40 bg-emerald-500/5"
                    : "border-border/40 bg-surface/40 hover:bg-surface"
                )}
              >
                <div>
                  <div className="text-sm text-foreground font-medium">Reimbursable</div>
                  <div className="text-[11px] text-ink-muted">Track expenses to be paid back</div>
                </div>
                <div className={cn("h-5 w-9 rounded-full p-0.5 transition-colors", reimbursable ? "bg-emerald-500" : "bg-border")}>
                  <div className={cn("h-4 w-4 rounded-full bg-background transition-transform", reimbursable && "translate-x-4")} />
                </div>
              </button>

              {isHouseholdMember && (
                <button
                  type="button"
                  onClick={() => setIsShared((v) => !v)}
                  className={cn(
                    "w-full flex items-center justify-between gap-3 px-4 py-3 rounded-2xl border text-left transition-colors",
                    isShared
                      ? "border-primary/40 bg-primary/5"
                      : "border-border/40 bg-surface/40 hover:bg-surface"
                  )}
                >
                  <div className="flex items-center gap-3">
                    <div className={cn(
                      "h-8 w-8 rounded-xl flex items-center justify-center shrink-0 transition-colors",
                      isShared ? "bg-primary/20 text-primary" : "bg-surface text-ink-muted"
                    )}>
                      <Users className="h-4 w-4" />
                    </div>
                    <div>
                      <div className="text-sm text-foreground font-medium">Share with Household</div>
                      <div className="text-[11px] text-ink-muted">Make this visible to your partner</div>
                    </div>
                  </div>
                  <div className={cn("h-5 w-9 rounded-full p-0.5 transition-colors", isShared ? "bg-primary" : "bg-border")}>
                    <div className={cn("h-4 w-4 rounded-full bg-background transition-transform", isShared && "translate-x-4")} />
                  </div>
                </button>
              )}
            </div>
          )}

          <Button
            type="submit"
            size="lg"
            className="w-full rounded-full bg-foreground text-background hover:bg-foreground/90 h-12 text-base font-medium"
          >
            {isEdit ? "Save changes" : "Save entry"}
          </Button>
        </form>

        {isProcessingReceipt && (
          <div className="absolute inset-0 bg-background/85 backdrop-blur-md z-20 flex flex-col items-center justify-center space-y-4 rounded-t-[32px] p-6 animate-in fade-in duration-300">
            <div className="h-14 w-14 rounded-2xl bg-surface flex items-center justify-center border border-border/40 shadow-sm relative">
              <Loader2 className="h-7 w-7 text-foreground animate-spin" />
              <Camera className="h-4 w-4 text-foreground/50 absolute bottom-1.5 right-1.5" />
            </div>
            <div className="text-center space-y-1.5 max-w-[280px]">
              <p className="font-serif text-lg font-medium text-foreground">Analyzing receipt…</p>
              <p className="text-xs text-ink-muted leading-relaxed">Gemini is extracting the merchant, amount, date, and category guess from your image.</p>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}