import { useEffect, useMemo, useRef, useState } from "react";
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
import { Plus, AlertCircle } from "lucide-react";

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
}

export function AddExpenseSheet({ 
  open, onOpenChange, categories, onAdd, onAddCategory, onAddSubcategory, editing, onUpdate,
  budgets = {}, spentByCategory = {}
}: Props) {
  const isEdit = !!editing;
  const [txnType, setTxnType] = useState<TxnType>("expense");
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>(categories[0]?.name ?? "Food");
  const [subcategory, setSubcategory] = useState<string>("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayISO());
  const [payment, setPayment] = useState<PaymentMethod>("upi");
  const [newCat, setNewCat] = useState("");
  const [showAddCat, setShowAddCat] = useState(false);
  const [newSub, setNewSub] = useState("");
  const [showAddSub, setShowAddSub] = useState(false);
  const [errors, setErrors] = useState<{ amount?: string; category?: string; date?: string }>({});
  const [submitted, setSubmitted] = useState(false);
  const [subSearch, setSubSearch] = useState("");

  const activeCategories = txnType === "income" ? INCOME_CATEGORIES : categories;
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

  useEffect(() => {
    if (open) {
      setSubSearch("");
      if (editing) {
        setTxnType(editing.type ?? "expense");
        setAmount(String(editing.amount));
        setCategory(editing.category);
        setSubcategory(editing.subcategory ?? "");
        setNote(editing.note ?? "");
        setDate(editing.date);
        setPayment(editing.payment_method);
      } else {
        setTxnType("expense");
        setAmount("");
        setCategory(categories[0]?.name ?? "Food");
        setSubcategory("");
        setNote("");
        setDate(todayISO());
        setPayment("upi");
      }
      setShowAddCat(false);
      setNewCat("");
      setErrors({});
      setSubmitted(false);
      // focus amount on open
      setTimeout(() => amountRef.current?.focus(), 80);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, editing]);

  const validate = (): typeof errors => {
    const errs: typeof errors = {};
    const num = parseFloat(amount);
    if (!amount.trim()) errs.amount = "Amount is required.";
    else if (Number.isNaN(num)) errs.amount = "Enter a valid number.";
    else if (num <= 0) errs.amount = "Amount must be greater than zero.";
    else if (num > 10_000_000) errs.amount = "Amount looks too large.";
    if (!category.trim()) errs.category = "Pick a category.";
    if (!date) errs.date = "Date is required.";
    else if (date > todayISO()) errs.date = "Date can't be in the future.";
    return errs;
  };

  // Live revalidation after first submit attempt
  useEffect(() => {
    if (submitted) setErrors(validate());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [amount, category, date, submitted]);

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
    const payload = {
      amount: num,
      category,
      subcategory: subcategory || undefined,
      note: note.trim() || undefined,
      date,
      payment_method: payment,
      type: txnType,
    };
    if (isEdit && editing && onUpdate) {
      onUpdate(editing.id, payload);
      vibrate([30, 50, 30]); // Success vibration
    } else {
      onAdd(payload);
      vibrate([30, 50, 30]); // Success vibration
    }
    onOpenChange(false);
  };


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

        <form onSubmit={submit} className="mt-6 space-y-8 pb-8">
          {/* Type toggle */}
          <div className="flex p-1 rounded-full bg-surface/60 border border-border/40">
            {(["expense", "income"] as TxnType[]).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => {
                  if (t === txnType) return;
                  setTxnType(t);
                  const list = t === "income" ? INCOME_CATEGORIES : categories;
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
              <span className="font-serif text-4xl text-ink-muted/60">{getCurrencySymbol()}</span>
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
                className="font-serif text-5xl h-16 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 placeholder:text-ink-muted/30 text-foreground"
              />
            </div>
            {errors.amount && (
              <p id="amount-error" className="text-xs text-destructive mt-2" role="alert">
                {errors.amount}
              </p>
            )}
            
            {budgetLimit > 0 && (draftAmount > 0 || isEdit) && (
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

            <Input
              type="text"
              maxLength={120}
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Add a note…"
              className="mt-4 border-0 border-b border-border rounded-none bg-transparent px-0 text-base text-foreground placeholder:text-ink-muted shadow-none focus-visible:ring-0 focus-visible:border-foreground"
            />
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
                    placeholder="Category name"
                    maxLength={24}
                    className="h-9 rounded-full bg-transparent border-border text-sm w-40"
                  />
                  <Button
                    type="button"
                    size="sm"
                    variant="secondary"
                    onClick={() => {
                      const v = newCat.trim();
                      if (!v) return;
                      onAddCategory(v);
                      setCategory(v);
                      setNewCat("");
                      setShowAddCat(false);
                    }}
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
                      placeholder="Subcategory"
                      maxLength={20}
                      className="h-8 rounded-full bg-transparent border-border text-xs w-32"
                    />
                    <Button
                      type="button"
                      size="sm"
                      variant="secondary"
                      onClick={() => {
                        const v = newSub.trim();
                        if (!v) return;
                        onAddSubcategory(category, v);
                        setSubcategory(v.toLowerCase());
                        setNewSub("");
                        setShowAddSub(false);
                      }}
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
              <Input
                id="date"
                type="date"
                value={date}
                max={todayISO()}
                onChange={(e) => setDate(e.target.value)}
                aria-invalid={!!errors.date}
                className="rounded-full bg-transparent border-border text-foreground"
              />
              {errors.date && (
                <p className="text-xs text-destructive" role="alert">{errors.date}</p>
              )}
            </div>
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full rounded-full bg-foreground text-background hover:bg-foreground/90 h-12 text-base font-medium"
          >
            {isEdit ? "Save changes" : "Save entry"}
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}