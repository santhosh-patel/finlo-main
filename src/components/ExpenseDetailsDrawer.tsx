import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  CategoryDef,
  Expense,
  formatINR,
  fullDateLabel,
  getCurrencySymbol,
  todayISO,
} from "@/lib/expenses";
import { Check, Pencil, Trash2, X, Tag, GitMerge, Plus, AlertCircle, RefreshCw } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { RollingDatePicker } from "./RollingDatePicker";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getIconForCategory, getColorForCategory } from "@/lib/categoryIcons";

interface Tag {
  id: string;
  name: string;
  color?: string;
  user_id?: string;
}

interface Split {
  id: string;
  parent_expense_id: string;
  user_id: string;
  category: string;
  amount: number;
  note?: string | null;
}

interface Props {
  expense: Expense | null;
  categories: CategoryDef[];
  onOpenChange: (open: boolean) => void;
  onUpdate: (id: string, patch: Partial<Omit<Expense, "id" | "created_at">>) => void;
  onDelete: (id: string) => void;
  onAddSubcategory?: (category: string, sub: string) => void;
  userId: string | null;
  onToggleReaction?: (id: string, emoji: string) => void;
}

export function ExpenseDetailsDrawer({
  expense,
  categories,
  onOpenChange,
  onUpdate,
  onDelete,
  onAddSubcategory,
  userId,
  onToggleReaction,
}: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [editing, setEditing] = useState(false);
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState("");
  const [subcategory, setSubcategory] = useState("");
  const [newSub, setNewSub] = useState("");
  const [showAddSub, setShowAddSub] = useState(false);
  const [date, setDate] = useState("");
  const [note, setNote] = useState("");
  const [splitNote, setSplitNote] = useState("");
  const [error, setError] = useState<string | null>(null);

  const [tags, setTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const lastExpenseIdRef = useRef<string | null>(null);
  const [newTag, setNewTag] = useState("");
  const [showTagInput, setShowTagInput] = useState(false);
  const [splits, setSplits] = useState<Split[]>([]);
  const [isSplitting, setIsSplitting] = useState(false);
  const [splitRows, setSplitRows] = useState<Array<{ category: string; amount: string; note: string }>>([]);
  const [splitSaving, setSplitSaving] = useState(false);
  const normalizedDate = date.trim().split("T")[0];

  const open = !!expense;
  const subs = categories.find((c) => c.name === category)?.subcategories ?? [];
  const isExpenseType = (expense?.type ?? "expense") === "expense";
  const isIncome = expense?.type === "income";

  const catDef = expense ? categories.find((c) => c.name === expense.category) : undefined;
  const CatIcon = expense ? getIconForCategory(expense.category, catDef?.icon) : undefined;
  const catColor = expense ? getColorForCategory(expense.category, catDef?.color) : "hsl(var(--surface))";

  const loadTagsAndSplits = useCallback(async () => {
    if (!expense || !userId) return;
    try {
      const { data: extags } = await supabase
        .from("expense_tags")
        .select("tag_id, tags(id, name, color)")
        .eq("expense_id", expense.id);
      if (extags) {
        setTags(
          (extags as unknown as Array<{ tags: { name: string } | null }>)
            .map((et) => et.tags?.name)
            .filter((name): name is string => typeof name === "string"),
        );
      }
      const { data: utags } = await supabase.from("tags").select("*").eq("user_id", userId);
      setAllTags(utags ?? []);
      const { data: dSplits } = await supabase.from("expense_splits").select("*").eq("parent_expense_id", expense.id);
      setSplits(dSplits ?? []);
    } catch (e) {
      console.error("Failed to load details extensions:", e);
    }
  }, [expense, userId]);

  useEffect(() => {
    if (open && userId) void loadTagsAndSplits();
    else { setTags([]); setSplits([]); setIsSplitting(false); }
  }, [open, userId, loadTagsAndSplits]);

  // Sync local fields from props when the row changes, or when server data updates while not editing.
  // Avoid resetting while the user is editing or splitting — same pattern as AddExpenseSheet + categories.
  useEffect(() => {
    if (!expense) {
      lastExpenseIdRef.current = null;
      setEditing(false);
      return;
    }

    const idChanged = lastExpenseIdRef.current !== expense.id;
    lastExpenseIdRef.current = expense.id;

    const applyFromServer = () => {
      setAmount(String(expense.amount));
      setCategory(expense.category);
      setSubcategory(expense.subcategory ?? "");
      setDate(expense.date);
      setNote(expense.note ?? "");
      setSplitNote(expense.split_note ?? "");
      setError(null);
      setShowAddSub(false);
      setNewSub("");
    };

    if (idChanged) {
      applyFromServer();
      setEditing(false);
      setIsSplitting(false);
      return;
    }

    if (editing || isSplitting) return;

    applyFromServer();
  }, [expense, editing, isSplitting]);

  const save = () => {
    if (!expense) return;
    const num = parseFloat(amount);
    if (!amount.trim() || Number.isNaN(num) || num <= 0)
      return setError("Enter a valid amount greater than zero.");
    if (!category.trim()) return setError("Pick a category.");
    if (!normalizedDate) return setError("Date is required.");
    if (normalizedDate > todayISO()) return setError("Date can't be in the future.");
    onUpdate(expense.id, {
      amount: num,
      category,
      subcategory: subcategory || undefined,
      date: normalizedDate,
      note: note.trim() || undefined,
      split_note: splitNote.trim() || undefined,
    });
    setEditing(false);
    setError(null);
  };

  const cancelEdit = () => {
    if (expense) {
      setAmount(String(expense.amount));
      setCategory(expense.category);
      setSubcategory(expense.subcategory ?? "");
      setDate(expense.date);
      setNote(expense.note ?? "");
      setSplitNote(expense.split_note ?? "");
    }
    setError(null);
    setEditing(false);
  };

  const handleAddTag = async () => {
    const rawName = newTag.trim().toLowerCase();
    if (!expense || !userId || !rawName) return;
    try {
      let tag = allTags.find((t) => t.name.toLowerCase() === rawName);
      if (!tag) {
        const { data: newTagRow, error: insertTagErr } = await supabase
          .from("tags")
          .insert({ user_id: userId, name: rawName })
          .select()
          .single();
        if (insertTagErr) throw insertTagErr;
        tag = newTagRow;
        setAllTags((prev) => [...prev, tag]);
      }
      const { error: relErr } = await supabase.from("expense_tags").insert({
        expense_id: expense.id,
        tag_id: tag.id,
        user_id: userId,
      });
      if (relErr && !relErr.message.includes("duplicate")) throw relErr;
      setTags((prev) => (prev.includes(rawName) ? prev : [...prev, rawName]));
      setNewTag("");
      setShowTagInput(false);
      toast({ title: "Tag added" });
    } catch (err: unknown) {
      toast({ title: "Failed to add tag", description: (err as Error).message, variant: "destructive" });
    }
  };

  const handleRemoveTag = async (tagName: string) => {
    if (!expense || !userId) return;
    try {
      const tag = allTags.find((t) => t.name.toLowerCase() === tagName.toLowerCase());
      if (!tag) return;
      const { error: delErr } = await supabase.from("expense_tags").delete().eq("expense_id", expense.id).eq("tag_id", tag.id);
      if (delErr) throw delErr;
      setTags((prev) => prev.filter((t) => t !== tagName));
      toast({ title: "Tag removed" });
    } catch (err: unknown) {
      toast({ title: "Failed to delete tag", description: (err as Error).message, variant: "destructive" });
    }
  };

  const handleToggleReimbursable = () => {
    if (!expense) return;
    const next = !expense.is_reimbursable;
    onUpdate(expense.id, { is_reimbursable: next, reimbursed_at: null });
    toast({ title: next ? "Marked reimbursable" : "Reimbursable removed" });
  };

  const handleToggleReimbursedStatus = () => {
    if (!expense) return;
    const next = !expense.reimbursed_at;
    onUpdate(expense.id, { reimbursed_at: next ? new Date().toISOString() : null });
    toast({ title: next ? "Marked settled" : "Marked unpaid" });
  };

  const startSplitting = () => {
    if (splits.length > 0) {
      setSplitRows(splits.map((s) => ({ category: s.category, amount: String(s.amount), note: s.note || "" })));
    } else {
      setSplitRows([{ category: expense?.category || "Food", amount: String(expense?.amount || ""), note: "" }]);
    }
    setIsSplitting(true);
  };

  const handleAddSplitRow = () => {
    const total = splitRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
    const rem = Math.max(0, (expense?.amount || 0) - total);
    setSplitRows((prev) => [...prev, { category: "Misc", amount: rem > 0 ? rem.toFixed(2) : "", note: "" }]);
  };

  const handleRemoveSplitRow = (idx: number) => setSplitRows((prev) => prev.filter((_, i) => i !== idx));

  const handleSaveSplits = async () => {
    if (!expense || !userId || splitSaving) return;
    const totalSplit = splitRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0);
    if (Math.abs(totalSplit - expense.amount) > 0.01) {
      setError(`Lines total (${getCurrencySymbol()}${totalSplit.toFixed(2)}) must equal ${getCurrencySymbol()}${expense.amount.toFixed(2)}`);
      return;
    }
    setSplitSaving(true);
    try {
      const { error: delErr } = await supabase.from("expense_splits").delete().eq("parent_expense_id", expense.id);
      if (delErr) throw delErr;
      const rows = splitRows.map((r) => ({
        parent_expense_id: expense.id,
        user_id: userId,
        category: r.category,
        amount: parseFloat(r.amount) || 0,
        note: r.note.trim() || null,
      }));
      if (rows.length > 0) {
        const { error: insErr } = await supabase.from("expense_splits").insert(rows);
        if (insErr) throw insErr;
      }
      toast({ title: "Split saved" });
      setIsSplitting(false);
      setError(null);
      setSplitSaving(false);
      loadTagsAndSplits();
    } catch (err: unknown) {
      setSplitSaving(false);
      toast({ title: "Couldn\u2019t save split", description: (err as Error).message, variant: "destructive" });
    }
  };

  /* ------------------------------------------------------------------ */
  /*  Render                                                             */
  /* ------------------------------------------------------------------ */
  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="bg-background border-border rounded-t-[28px] max-h-[88dvh] overflow-y-auto overscroll-contain p-0"
        >
          {expense && (
            <div className="flex flex-col">
              {/* ── Drag handle ── */}
              <div className="sticky top-0 z-10 flex justify-center pt-3 pb-1 bg-background rounded-t-[28px]">
                <div className="h-[5px] w-10 rounded-full bg-foreground/10" aria-hidden />
              </div>

              <div className="px-5 sm:px-6 pb-6 sm:pb-8">
                <SheetHeader className="text-left pr-8 mb-5">
                  <SheetTitle className="sr-only">
                    {editing ? "Edit transaction" : isSplitting ? "Split" : "Transaction details"}
                  </SheetTitle>
                </SheetHeader>

                {!editing && !isSplitting ? (
                  /* ═══════ DETAILS VIEW ═══════ */
                  <div className="space-y-5">
                    {/* Hero card */}
                    <div className="relative rounded-3xl p-5 sm:p-6 overflow-hidden">
                      <div
                        className="absolute inset-0 opacity-[0.07]"
                        style={{ backgroundColor: catColor }}
                      />
                      <div className="relative">
                        {/* Category icon + badge */}
                        <div className="flex items-center justify-between mb-4">
                          <div className="flex items-center gap-2.5">
                            {CatIcon && (
                              <div
                                className="h-10 w-10 rounded-2xl flex items-center justify-center"
                                style={{ backgroundColor: catColor + "22" }}
                              >
                                <CatIcon className="h-5 w-5" style={{ color: catColor }} />
                              </div>
                            )}
                            <div className="min-w-0">
                              <p className="text-sm font-semibold text-foreground truncate">{expense.category}</p>
                              {expense.subcategory && (
                                <p className="text-[11px] text-ink-muted capitalize">{expense.subcategory}</p>
                              )}
                            </div>
                          </div>
                          {expense.is_reimbursable && (
                            <span className={cn(
                              "text-[9px] uppercase tracking-wider font-semibold px-2.5 py-1 rounded-full shrink-0",
                              expense.reimbursed_at
                                ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400"
                                : "bg-amber-500/10 text-amber-600",
                            )}>
                              {expense.reimbursed_at ? "Settled" : "Pending"}
                            </span>
                          )}
                        </div>

                        {/* Amount */}
                        <div className="flex items-baseline gap-1">
                          <span className={cn(
                            "font-serif tabular-nums leading-none",
                            isIncome ? "text-emerald-600 dark:text-emerald-400" : "text-foreground",
                            expense.amount >= 10000 ? "text-4xl sm:text-5xl" : "text-5xl sm:text-6xl",
                          )}>
                            {isIncome ? "+" : ""}{getCurrencySymbol()}{formatINR(expense.amount)}
                          </span>
                        </div>

                        {expense.note && (
                          <p className="mt-3 text-sm text-foreground/80 leading-relaxed">{expense.note}</p>
                        )}

                        {/* Meta row */}
                        <div className="flex items-center gap-3 mt-4 text-[11px] sm:text-xs text-ink-muted">
                          <span>{fullDateLabel(expense.date)}</span>
                          <span className="w-1 h-1 rounded-full bg-ink-muted/30" />
                          <span className="uppercase">{expense.payment_method}</span>
                          <span className="w-1 h-1 rounded-full bg-ink-muted/30" />
                          <span className="uppercase">{expense.type || "expense"}</span>
                        </div>
                      </div>
                    </div>
 
                    {/* Reactions */}
                    {onToggleReaction && (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {["❤️", "👍", "😮", "💸", "🤑"].map((emoji) => {
                          const count = expense.reactions?.filter(r => r.emoji === emoji).length || 0;
                          const hasReacted = expense.reactions?.some(r => r.user_id === userId && r.emoji === emoji);
                          return (
                            <button
                              key={emoji}
                              onClick={() => onToggleReaction(expense.id, emoji)}
                              className={cn(
                                "flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs transition-all border",
                                hasReacted 
                                  ? "bg-primary/10 border-primary/30 text-primary scale-105" 
                                  : "bg-surface/40 border-border/20 text-ink-muted hover:bg-surface/60"
                              )}
                            >
                              <span>{emoji}</span>
                              {count > 0 && <span className="font-semibold">{count}</span>}
                            </button>
                          );
                        })}
                      </div>
                    )}

                    {/* Tags */}
                    <div className="space-y-2">
                      <p className="text-[10px] uppercase tracking-[0.15em] text-ink-muted/60 font-semibold flex items-center gap-1.5">
                        <Tag className="h-3 w-3" /> Tags
                      </p>
                      <div className="flex flex-wrap gap-1.5 items-center">
                        {tags.map((t) => (
                          <span key={t} className="group inline-flex items-center gap-1 bg-surface/60 border border-border/30 px-2.5 py-1 rounded-full text-xs text-foreground capitalize">
                            {t}
                            <button
                              type="button"
                              onClick={() => handleRemoveTag(t)}
                              className="opacity-0 group-hover:opacity-100 hover:text-destructive text-ink-muted/40 transition-opacity ml-0.5"
                              aria-label={`Remove tag ${t}`}
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                        {!showTagInput ? (
                          <button
                            type="button"
                            onClick={() => setShowTagInput(true)}
                            className="inline-flex items-center gap-1 text-[11px] text-ink-muted/60 hover:text-foreground border border-dashed border-border/40 hover:border-foreground/30 px-2.5 py-1 rounded-full transition-all bg-transparent"
                          >
                            <Plus className="h-3 w-3" /> Add
                          </button>
                        ) : (
                          <div className="inline-flex items-center gap-1.5">
                            <Input
                              autoFocus
                              value={newTag}
                              onChange={(e) => setNewTag(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  void handleAddTag();
                                }
                                if (e.key === "Escape") setShowTagInput(false);
                              }}
                              placeholder="Tag name"
                              className="h-7 px-2.5 rounded-full text-xs bg-background border-border/50 w-28"
                            />
                            <Button type="button" size="sm" className="h-7 px-2.5 rounded-full text-[11px]" onClick={() => void handleAddTag()}>Add</Button>
                            <button type="button" onClick={() => setShowTagInput(false)} className="text-ink-muted/40 hover:text-foreground transition-colors">
                              <X className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Splits ledger */}
                    {splits.length > 0 && (
                      <div className="space-y-2">
                        <p className="text-[10px] uppercase tracking-[0.15em] text-ink-muted/60 font-semibold flex items-center gap-1.5">
                          <GitMerge className="h-3 w-3" /> Split &middot; {splits.length} line{splits.length !== 1 && "s"}
                        </p>
                        <div className="rounded-2xl border border-border/30 bg-surface/20 divide-y divide-border/20 overflow-hidden">
                          {splits.map((s, i) => (
                            <div key={s.id || i} className="flex items-center justify-between p-3 sm:p-3.5 gap-3">
                              <div className="min-w-0">
                                <span className="text-[13px] font-medium text-foreground">{s.category}</span>
                                {s.note && <span className="text-[11px] text-ink-muted/60 block mt-0.5 truncate">{s.note}</span>}
                              </div>
                              <span className="font-serif text-sm text-foreground tabular-nums shrink-0">
                                {getCurrencySymbol()}{formatINR(Number(s.amount))}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Reimbursable section */}
                    {isExpenseType && (
                      <div className="space-y-3">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] uppercase tracking-[0.15em] text-ink-muted/60 font-semibold">Reimbursement</p>
                          <button
                            type="button"
                            onClick={handleToggleReimbursable}
                            className="relative h-[22px] w-[40px] rounded-full transition-colors duration-300"
                            style={{ backgroundColor: expense.is_reimbursable ? "hsl(var(--foreground))" : "hsl(var(--border) / 0.8)" }}
                            role="switch"
                            aria-checked={expense.is_reimbursable}
                            aria-label="Toggle reimbursable"
                          >
                            <div className={cn(
                              "absolute top-[3px] left-[3px] h-4 w-4 rounded-full bg-background shadow-sm transition-transform duration-300 ease-out-soft",
                              expense.is_reimbursable && "translate-x-[18px]",
                            )} />
                          </button>
                        </div>
                        {expense.is_reimbursable && (
                          <div className="flex items-center justify-between p-3.5 rounded-2xl bg-surface/30 border border-border/20">
                            <div className="min-w-0">
                              <p className="text-[13px] font-medium text-foreground">
                                {expense.reimbursed_at ? "Settled" : "Awaiting payback"}
                              </p>
                              {expense.reimbursed_at && (
                                <p className="text-[11px] text-ink-muted/60 mt-0.5">
                                  {new Date(expense.reimbursed_at).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}
                                </p>
                              )}
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleToggleReimbursedStatus}
                              className={cn(
                                "rounded-full text-xs h-9 px-3.5 shrink-0",
                                expense.reimbursed_at
                                  ? "text-ink-muted"
                                  : "text-emerald-600 bg-emerald-500/5 border-emerald-500/20 hover:bg-emerald-500/10",
                              )}
                            >
                              {expense.reimbursed_at ? "Undo" : "Mark settled"}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {/* Split note */}
                    {isExpenseType && (
                      <div className="space-y-1.5">
                        <p className="text-[10px] uppercase tracking-[0.15em] text-ink-muted/60 font-semibold">Note</p>
                        <Input
                          value={splitNote}
                          onChange={(e) => setSplitNote(e.target.value)}
                          onBlur={() => {
                            const t = splitNote.trim();
                            const cur = (expense.split_note ?? "").trim();
                            if (t !== cur) onUpdate(expense.id, { split_note: t || undefined });
                          }}
                          placeholder="e.g. with Kavya, office lunch"
                          maxLength={200}
                          className="rounded-xl bg-surface/20 border-border/30 text-sm h-10 placeholder:text-ink-muted/30"
                        />
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center gap-2 pt-3">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setEditing(true)}
                        className="flex-1 rounded-full h-11 text-[13px] gap-1.5"
                      >
                        <Pencil className="h-3.5 w-3.5 shrink-0" /> Edit
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={startSplitting}
                        className="flex-1 rounded-full h-11 text-[13px] gap-1.5"
                      >
                        <GitMerge className="h-3.5 w-3.5 shrink-0" />
                        {splits.length > 0 ? "Manage split" : "Split"}
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        onClick={() => setConfirmOpen(true)}
                        className="rounded-full h-11 w-11 p-0 shrink-0 text-ink-muted hover:text-destructive hover:bg-destructive/5"
                        aria-label="Delete"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ) : isSplitting ? (
                  /* ═══════ SPLIT EDITOR ═══════ */
                  <div className="space-y-4">
                    <div>
                      <h2 className="text-lg font-semibold text-foreground">Split transaction</h2>
                      <p className="text-[13px] text-ink-muted/60 mt-0.5">
                        Divide{" "}
                        <span className="font-semibold text-foreground font-serif">
                          {getCurrencySymbol()}{formatINR(expense.amount)}
                        </span>{" "}
                        across lines
                      </p>
                    </div>

                    <div className="space-y-2.5">
                      {splitRows.map((row, idx) => (
                        <div
                          key={idx}
                          className="rounded-2xl border border-border/20 bg-surface/20 p-3.5 space-y-2.5"
                        >
                          <div className="flex items-start gap-2.5">
                            <div className="flex-1 grid grid-cols-2 gap-2">
                              <div>
                                <Label className="text-[9px] uppercase tracking-wider text-ink-muted/50 font-medium">Category</Label>
                                <Select
                                  value={row.category}
                                  onValueChange={(val) => setSplitRows((prev) => prev.map((r, i) => i === idx ? { ...r, category: val } : r))}
                                >
                                  <SelectTrigger className="h-9 rounded-lg mt-1 border-border/30 bg-background text-[13px]">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="bg-popover max-h-[min(50vh,320px)]">
                                    {categories.map((c) => (
                                      <SelectItem key={c.name} value={c.name} className="text-[13px]">{c.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div>
                                <Label className="text-[9px] uppercase tracking-wider text-ink-muted/50 font-medium">Amount</Label>
                                <Input
                                  type="number"
                                  inputMode="decimal"
                                  step="0.01"
                                  placeholder="0.00"
                                  value={row.amount}
                                  onChange={(e) => {
                                    setSplitRows((prev) => prev.map((r, i) => i === idx ? { ...r, amount: e.target.value } : r));
                                    setError(null);
                                  }}
                                  className="h-9 rounded-lg mt-1 bg-background border-border/30 text-sm font-serif"
                                />
                              </div>
                            </div>
                            <button
                              type="button"
                              onClick={() => handleRemoveSplitRow(idx)}
                              className="mt-4 p-2 rounded-xl text-ink-muted/30 hover:text-destructive hover:bg-destructive/5 transition-colors shrink-0"
                              aria-label="Remove line"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          <Input
                            type="text"
                            placeholder="Note (optional)"
                            value={row.note}
                            onChange={(e) => setSplitRows((prev) => prev.map((r, i) => i === idx ? { ...r, note: e.target.value } : r))}
                            className="h-8 rounded-lg bg-background border-border/20 text-xs placeholder:text-ink-muted/30"
                          />
                        </div>
                      ))}
                    </div>

                    {/* Totals bar */}
                    <div className="flex items-center justify-between bg-surface/20 px-4 py-3 rounded-xl border border-border/20">
                      <span className="text-xs text-ink-muted/60">Total</span>
                      <span className={cn(
                        "font-serif font-semibold text-sm tabular-nums",
                        Math.abs(splitRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0) - expense.amount) < 0.01
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-destructive",
                      )}>
                        {getCurrencySymbol()}{formatINR(splitRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0))}
                        <span className="text-ink-muted/40 font-sans font-normal text-xs mx-1">/</span>
                        {getCurrencySymbol()}{formatINR(expense.amount)}
                      </span>
                    </div>

                    {error && (
                      <div className="flex items-start gap-2 text-xs text-destructive bg-destructive/5 p-3 rounded-xl border border-destructive/10" role="alert">
                        <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                        <span>{error}</span>
                      </div>
                    )}

                    {/* Split actions */}
                    <div className="flex items-center gap-2">
                      <Button variant="outline" className="flex-1 rounded-full h-10 text-xs gap-1.5" onClick={handleAddSplitRow}>
                        <Plus className="h-3.5 w-3.5" /> Add line
                      </Button>
                      <Button
                        variant="outline"
                        className="rounded-full h-10 w-10 p-0 shrink-0"
                        onClick={() => { setSplitRows([]); setError(null); }}
                        title="Clear all"
                      >
                        <RefreshCw className="h-3.5 w-3.5" />
                      </Button>
                    </div>

                    <div className="grid grid-cols-2 gap-2.5 pt-2 border-t border-border/15">
                      <Button variant="secondary" onClick={() => { setIsSplitting(false); setError(null); }} className="rounded-full h-11 text-[13px]">
                        Cancel
                      </Button>
                      <Button
                        disabled={splitSaving}
                        onClick={handleSaveSplits}
                        className="rounded-full h-11 text-[13px] bg-foreground text-background hover:bg-foreground/90 disabled:opacity-50"
                      >
                        {splitSaving ? "Saving\u2026" : "Save split"}
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* ═══════ EDIT VIEW ═══════ */
                  <div className="space-y-5">
                    <h2 className="text-lg font-semibold text-foreground">Edit transaction</h2>

                    {/* Amount */}
                    <div className="rounded-2xl bg-surface/20 border border-border/20 p-4 sm:p-5">
                      <div className="flex items-center gap-2">
                        <span className="font-serif text-3xl text-ink-muted/40">{getCurrencySymbol()}</span>
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          value={amount}
                          onChange={(e) => { setAmount(e.target.value); setError(null); }}
                          className="font-serif text-4xl sm:text-5xl h-14 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 text-foreground"
                        />
                      </div>
                      <Input
                        type="text"
                        maxLength={120}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Add a note\u2026"
                        className="mt-3 border-0 border-b border-border/30 rounded-none bg-transparent px-0 text-sm text-foreground placeholder:text-ink-muted/30 shadow-none focus-visible:ring-0 focus-visible:border-foreground/30"
                      />
                      {isExpenseType && (
                        <Input
                          type="text"
                          maxLength={200}
                          value={splitNote}
                          onChange={(e) => setSplitNote(e.target.value)}
                          placeholder="Split note (optional)"
                          className="mt-2.5 border-0 border-b border-border/20 rounded-none bg-transparent px-0 text-xs text-foreground placeholder:text-ink-muted/25 shadow-none focus-visible:ring-0"
                        />
                      )}
                    </div>

                    {/* Category chips */}
                    <div className="space-y-2">
                      <p className="text-[10px] uppercase tracking-[0.15em] text-ink-muted/60 font-semibold">Category</p>
                      <div className="flex flex-wrap gap-1.5">
                        {categories.map((c) => (
                          <button
                            key={c.name}
                            type="button"
                            onClick={() => { setCategory(c.name); setSubcategory(""); setError(null); }}
                            className={cn(
                              "px-3 py-1.5 rounded-full text-[13px] transition-all border",
                              category === c.name
                                ? "bg-foreground text-background border-foreground font-medium scale-[1.02]"
                                : "border-border/40 text-ink-muted/70 hover:border-foreground/30 hover:text-foreground",
                            )}
                          >
                            {c.name}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Subcategory */}
                    {(subs.length > 0 || onAddSubcategory) && (
                      <div className="space-y-2">
                        <p className="text-[10px] uppercase tracking-[0.15em] text-ink-muted/60 font-semibold">
                          Subcategory <span className="normal-case tracking-normal opacity-50">(optional)</span>
                        </p>
                        <div className="flex flex-wrap gap-1.5">
                          {subs.map((s) => (
                            <button
                              key={s}
                              type="button"
                              onClick={() => setSubcategory(subcategory === s ? "" : s)}
                              className={cn(
                                "px-3 py-1.5 rounded-full text-xs transition-all border capitalize",
                                subcategory === s
                                  ? "bg-foreground text-background border-foreground"
                                  : "border-border/40 text-ink-muted/60 hover:text-foreground",
                              )}
                            >
                              {s}
                            </button>
                          ))}
                          {onAddSubcategory && !showAddSub && (
                            <button
                              type="button"
                              onClick={() => setShowAddSub(true)}
                              className="px-3 py-1.5 rounded-full text-xs border border-dashed border-border/40 text-ink-muted/40 hover:text-foreground hover:border-foreground/30 transition-all"
                            >
                              + New
                            </button>
                          )}
                          {onAddSubcategory && showAddSub && (
                            <div className="inline-flex items-center gap-1.5">
                              <Input
                                autoFocus
                                value={newSub}
                                onChange={(e) => setNewSub(e.target.value)}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    const v = newSub.trim();
                                    if (!v || !onAddSubcategory) return;
                                    onAddSubcategory(category, v);
                                    setSubcategory(v.toLowerCase());
                                    setNewSub("");
                                    setShowAddSub(false);
                                  }
                                  if (e.key === "Escape") setShowAddSub(false);
                                }}
                                placeholder="Subcategory"
                                maxLength={20}
                                className="h-7 rounded-full bg-transparent border-border/40 text-xs w-28"
                              />
                              <Button
                                type="button"
                                size="sm"
                                variant="secondary"
                                className="h-7 rounded-full text-[11px]"
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

                    {/* Date */}
                    <div className="space-y-2">
                      <p className="text-[10px] uppercase tracking-[0.15em] text-ink-muted/60 font-semibold">Date</p>
                      <RollingDatePicker
                        value={date}
                        max={todayISO()}
                        showTime={false}
                        onChange={(val) => { setDate(val); setError(null); }}
                      />
                    </div>

                    {error && (
                      <p className="text-xs text-destructive" role="alert">{error}</p>
                    )}

                    <div className="grid grid-cols-2 gap-2.5 pt-2">
                      <Button variant="secondary" onClick={cancelEdit} className="rounded-full h-11 text-[13px]">
                        Cancel
                      </Button>
                      <Button
                        onClick={save}
                        className="rounded-full h-11 text-[13px] bg-foreground text-background hover:bg-foreground/90"
                      >
                        Save changes
                      </Button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="bg-background border-border max-w-[360px] rounded-3xl p-6">
          <AlertDialogHeader>
            <AlertDialogTitle className="text-lg font-semibold text-foreground">
              Delete this entry?
            </AlertDialogTitle>
            <AlertDialogDescription className="text-sm text-ink-muted">
              {expense
                ? `${getCurrencySymbol()}${formatINR(expense.amount)} \u00b7 ${expense.category}${expense.note ? ` \u00b7 ${expense.note}` : ""}. This can\u2019t be undone.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter className="gap-2 sm:gap-2">
            <AlertDialogCancel className="rounded-full flex-1">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full flex-1 bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (expense) {
                  onDelete(expense.id);
                  setConfirmOpen(false);
                  onOpenChange(false);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
