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
import { useCallback, useEffect, useState } from "react";
import { RollingDatePicker } from "./RollingDatePicker";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";

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
}

export function ExpenseDetailsDrawer({
  expense,
  categories,
  onOpenChange,
  onUpdate,
  onDelete,
  onAddSubcategory,
  userId,
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
  
  // Tags & Splits states
  const [tags, setTags] = useState<string[]>([]);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [newTag, setNewTag] = useState("");
  const [showTagInput, setShowTagInput] = useState(false);
  const [splits, setSplits] = useState<Split[]>([]);
  const [isSplitting, setIsSplitting] = useState(false);
  const [splitRows, setSplitRows] = useState<Array<{ category: string; amount: string; note: string }>>([]);

  const open = !!expense;
  const subs = categories.find((c) => c.name === category)?.subcategories ?? [];

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
            .filter((name): name is string => typeof name === "string")
        );
      }

      const { data: utags } = await supabase
        .from("tags")
        .select("*")
        .eq("user_id", userId);
      setAllTags(utags ?? []);

      const { data: dSplits } = await supabase
        .from("expense_splits")
        .select("*")
        .eq("parent_expense_id", expense.id);
      setSplits(dSplits ?? []);
    } catch (e) {
      console.error("Failed to load details extensions:", e);
    }
  }, [expense, userId]);

  useEffect(() => {
    if (open && userId) {
      void loadTagsAndSplits();
    } else {
      setTags([]);
      setSplits([]);
      setIsSplitting(false);
    }
  }, [open, userId, loadTagsAndSplits]);

  useEffect(() => {
    if (expense) {
      setAmount(String(expense.amount));
      setCategory(expense.category);
      setSubcategory(expense.subcategory ?? "");
      setDate(expense.date);
      setNote(expense.note ?? "");
      setSplitNote(expense.split_note ?? "");
      setError(null);
      setShowAddSub(false);
      setNewSub("");
    } else {
      setEditing(false);
    }
  }, [expense]);

  const save = () => {
    if (!expense) return;
    const num = parseFloat(amount);
    if (!amount.trim() || Number.isNaN(num) || num <= 0)
      return setError("Enter a valid amount greater than zero.");
    if (!category.trim()) return setError("Pick a category.");
    if (!date) return setError("Date is required.");
    if (date > todayISO()) return setError("Date can't be in the future.");
    
    onUpdate(expense.id, {
      amount: num,
      category,
      subcategory: subcategory || undefined,
      date,
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

  // Tag Operations
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
      if (relErr) {
        // Ignored if duplicate primary key
        if (!relErr.message.includes("duplicate")) throw relErr;
      }

      setTags((prev) => {
        if (prev.includes(rawName)) return prev;
        return [...prev, rawName];
      });
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

      const { error: delErr } = await supabase
        .from("expense_tags")
        .delete()
        .eq("expense_id", expense.id)
        .eq("tag_id", tag.id);
      if (delErr) throw delErr;

      setTags((prev) => prev.filter((t) => t !== tagName));
      toast({ title: "Tag removed" });
    } catch (err: unknown) {
      toast({ title: "Failed to delete tag", description: (err as Error).message, variant: "destructive" });
    }
  };

  // Reimbursable Operations
  const handleToggleReimbursable = () => {
    if (!expense) return;
    const isNowReimbursable = !expense.is_reimbursable;
    onUpdate(expense.id, {
      is_reimbursable: isNowReimbursable,
      reimbursed_at: null, // Clear reimbursement date if toggled
    });
    toast({ title: isNowReimbursable ? "Marked as reimbursable" : "Removed reimbursable flag" });
  };

  const handleToggleReimbursedStatus = () => {
    if (!expense) return;
    const isNowReimbursed = !expense.reimbursed_at;
    onUpdate(expense.id, {
      reimbursed_at: isNowReimbursed ? new Date().toISOString() : null,
    });
    toast({ title: isNowReimbursed ? "Marked as reimbursed" : "Marked as unpaid" });
  };

  // Splitting Operations
  const startSplitting = () => {
    if (splits.length > 0) {
      setSplitRows(splits.map((s) => ({ category: s.category, amount: String(s.amount), note: s.note || "" })));
    } else {
      setSplitRows([
        { category: expense?.category || "Food", amount: String(expense?.amount || ""), note: "" }
      ]);
    }
    setIsSplitting(true);
  };

  const handleAddSplitRow = () => {
    const totalCurrentSplit = splitRows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
    const remainder = Math.max(0, (expense?.amount || 0) - totalCurrentSplit);
    setSplitRows((prev) => [...prev, { category: "Misc", amount: remainder > 0 ? remainder.toFixed(2) : "", note: "" }]);
  };

  const handleRemoveSplitRow = (idx: number) => {
    setSplitRows((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleSaveSplits = async () => {
    if (!expense || !userId) return;
    const totalSplitAmt = splitRows.reduce((sum, r) => sum + (parseFloat(r.amount) || 0), 0);
    if (Math.abs(totalSplitAmt - expense.amount) > 0.01) {
      setError(`Lines total (${getCurrencySymbol()}${totalSplitAmt.toFixed(2)}) must match the transaction (${getCurrencySymbol()}${expense.amount.toFixed(2)}).`);
      return;
    }

    try {
      // 1. Delete existing splits
      const { error: delErr } = await supabase
        .from("expense_splits")
        .delete()
        .eq("parent_expense_id", expense.id);
      if (delErr) throw delErr;

      // 2. Insert new splits
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
      loadTagsAndSplits();
    } catch (err: unknown) {
      toast({ title: "Couldn’t save split", description: (err as Error).message, variant: "destructive" });
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="bg-background border-border rounded-t-[32px] max-h-[85vh] overflow-y-auto"
        >
          {expense && (
            <>
              <SheetHeader className="text-left pr-10">
                <SheetTitle className="font-serif text-2xl sm:text-3xl font-normal text-foreground leading-tight">
                  {editing ? "Edit transaction" : isSplitting ? "Split" : "Transaction Details"}
                </SheetTitle>
              </SheetHeader>

              <div className="mt-5 sm:mt-6 space-y-6 sm:space-y-8 pb-6 sm:pb-8">
                {!editing && !isSplitting ? (
                  <>
                    <div className="bg-surface/60 rounded-3xl p-4 sm:p-6 border border-border/40 text-center relative overflow-hidden">
                      {expense.is_reimbursable && (
                        <div className={cn(
                          "absolute top-3 right-3 text-[9px] uppercase tracking-wider font-semibold px-2 py-1 rounded-full",
                          expense.reimbursed_at 
                            ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20" 
                            : "bg-amber-500/10 text-amber-600 border border-amber-500/20"
                        )}>
                          {expense.reimbursed_at ? "Reimbursed" : "Reimbursable"}
                        </div>
                      )}
                      <div className="font-serif text-4xl sm:text-5xl md:text-6xl text-foreground tabular-nums leading-none">
                        <span className="text-ink-muted/40 text-2xl sm:text-3xl mr-0.5 sm:mr-1 align-top">{getCurrencySymbol()}</span>
                        {formatINR(expense.amount)}
                      </div>
                      {expense.note && (
                        <p className="mt-3 text-foreground text-sm font-medium">{expense.note}</p>
                      )}
                    </div>

                    <dl className="space-y-4 text-sm">
                      <Row label="Type" value={expense.type?.toUpperCase() || "EXPENSE"} />
                      <Row label="Category" value={expense.category} />
                      {expense.subcategory && (
                        <Row label="Subcategory" value={expense.subcategory} />
                      )}
                      <Row label="Date" value={fullDateLabel(expense.date)} />
                      <Row label="Payment" value={expense.payment_method.toUpperCase()} />
                    </dl>

                    {/* Tags Section */}
                    <div className="space-y-2.5 pt-2 border-t border-border/20">
                      <Label className="text-[10px] tracking-[0.2em] uppercase text-ink-muted font-semibold flex items-center gap-1.5">
                        <Tag className="h-3 w-3" /> Tags
                      </Label>
                      <div className="flex flex-wrap gap-1.5 items-center">
                        {tags.map((t) => (
                          <span key={t} className="inline-flex items-center gap-1 bg-surface border border-border/40 px-2.5 py-1 rounded-full text-xs text-foreground capitalize">
                            {t}
                            <button onClick={() => handleRemoveTag(t)} className="hover:text-destructive text-ink-muted/60 transition-colors ml-0.5">
                              <X className="h-3 w-3" />
                            </button>
                          </span>
                        ))}
                        {!showTagInput ? (
                          <button onClick={() => setShowTagInput(true)} className="inline-flex items-center gap-1 text-xs text-ink-muted hover:text-foreground border border-dashed border-border hover:border-foreground/40 px-2.5 py-1 rounded-full transition-colors bg-transparent">
                            <Plus className="h-3 w-3" /> Add tag
                          </button>
                        ) : (
                          <div className="inline-flex items-center gap-1.5">
                            <Input
                              autoFocus
                              value={newTag}
                              onChange={(e) => setNewTag(e.target.value)}
                              onKeyDown={(e) => { if (e.key === "Enter") handleAddTag(); }}
                              placeholder="Tag name"
                              className="h-7 px-2.5 rounded-full text-xs bg-background border-border w-28"
                            />
                            <Button size="sm" className="h-7 px-2 rounded-full" onClick={handleAddTag}>Add</Button>
                            <button onClick={() => setShowTagInput(false)} className="text-ink-muted hover:text-foreground"><X className="h-4 w-4" /></button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Splits Ledger Section */}
                    {splits.length > 0 && (
                      <div className="space-y-3 pt-3 border-t border-border/20">
                        <Label className="text-[10px] sm:text-[11px] tracking-[0.18em] sm:tracking-[0.2em] uppercase text-ink-muted font-semibold flex items-center gap-1.5">
                          <GitMerge className="h-3 w-3 shrink-0" /> Split · {splits.length} line{splits.length === 1 ? "" : "s"}
                        </Label>
                        <div className="rounded-2xl border border-border/40 bg-surface/20 divide-y divide-border/30 overflow-hidden">
                          {splits.map((s, i) => (
                            <div key={s.id || i} className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:items-center p-3 sm:p-3.5 text-sm">
                              <div className="min-w-0">
                                <span className="font-semibold text-foreground text-xs sm:text-sm">{s.category}</span>
                                {s.note && <span className="text-[10px] sm:text-xs text-ink-muted block mt-0.5 break-words">{s.note}</span>}
                              </div>
                              <span className="font-serif text-sm sm:text-base text-foreground tabular-nums sm:text-right shrink-0">
                                {getCurrencySymbol()}{formatINR(Number(s.amount))}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {/* Reimbursable Section */}
                    {(expense.type ?? "expense") === "expense" && (
                      <div className="space-y-3 pt-3 border-t border-border/20">
                        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <h4 className="text-sm sm:text-base font-semibold text-foreground">Reimbursements</h4>
                            <p className="text-xs sm:text-sm text-ink-muted mt-0.5">Track if this is paid back by company or friends</p>
                          </div>
                          <button
                            onClick={handleToggleReimbursable}
                            className={cn(
                              "text-xs sm:text-sm px-3 sm:px-4 py-2 min-h-[44px] sm:min-h-0 rounded-full border transition-all font-medium shrink-0 self-start sm:self-auto",
                              expense.is_reimbursable 
                                ? "bg-amber-500/10 border-amber-500/20 text-amber-600" 
                                : "bg-transparent border-border text-ink-muted hover:text-foreground"
                            )}
                          >
                            {expense.is_reimbursable ? "Disable tracking" : "Enable tracking"}
                          </button>
                        </div>
                        {expense.is_reimbursable && (
                          <div className="p-3.5 sm:p-4 rounded-2xl bg-surface/40 border border-border/30 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between text-xs sm:text-sm mt-2">
                            <div className="min-w-0">
                              <span className="font-medium text-foreground">Reimbursement status</span>
                              <p className="text-[10px] sm:text-xs text-ink-muted mt-0.5">
                                {expense.reimbursed_at 
                                  ? `Settled on ${new Date(expense.reimbursed_at).toLocaleDateString()}` 
                                  : "Awaiting payback"}
                              </p>
                            </div>
                            <Button
                              size="sm"
                              variant="outline"
                              onClick={handleToggleReimbursedStatus}
                              className={cn(
                                "rounded-full text-xs sm:text-sm h-10 sm:h-9 px-4 w-full sm:w-auto min-h-[44px] sm:min-h-0",
                                expense.reimbursed_at 
                                  ? "text-ink-muted hover:text-destructive" 
                                  : "text-emerald-600 hover:text-emerald-700 bg-emerald-500/5 hover:bg-emerald-500/10 border-emerald-500/20"
                              )}
                            >
                              {expense.reimbursed_at ? "Mark as Unpaid" : "Mark as Settled"}
                            </Button>
                          </div>
                        )}
                      </div>
                    )}

                    {(expense.type ?? "expense") === "expense" && (
                      <div className="space-y-2 pt-3 border-t border-border/20">
                        <Label className="text-[10px] sm:text-[11px] tracking-[0.18em] sm:tracking-[0.2em] uppercase text-ink-muted font-semibold">
                          Split note
                        </Label>
                        <Input
                          value={splitNote}
                          onChange={(e) => setSplitNote(e.target.value)}
                          onBlur={() => {
                            const t = splitNote.trim();
                            const cur = (expense.split_note ?? "").trim();
                            if (t !== cur) {
                              onUpdate(expense.id, { split_note: t || undefined });
                            }
                          }}
                          placeholder="e.g. with Kavya, office lunch"
                          maxLength={200}
                          className="rounded-xl bg-background border-border text-sm sm:text-base h-11 sm:h-10 min-h-[44px] sm:min-h-0"
                        />
                      </div>
                    )}

                    <div className="flex flex-col gap-2 sm:grid sm:grid-cols-3 sm:gap-2.5 pt-4 border-t border-border/20">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setEditing(true)}
                        className="rounded-full min-h-[48px] h-12 sm:h-11 text-xs sm:text-sm px-3 w-full sm:w-auto justify-center"
                      >
                        <Pencil className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 shrink-0" /> <span className="truncate">Edit details</span>
                      </Button>
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={startSplitting}
                        className="rounded-full min-h-[48px] h-12 sm:h-11 text-xs sm:text-sm px-3 w-full sm:w-auto justify-center"
                      >
                        <GitMerge className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 shrink-0" />{" "}
                        <span className="truncate">{splits.length > 0 ? "Manage split" : "Split"}</span>
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={() => setConfirmOpen(true)}
                        className="rounded-full min-h-[48px] h-12 sm:h-11 text-xs sm:text-sm px-3 w-full sm:w-auto justify-center"
                      >
                        <Trash2 className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 shrink-0" /> Delete
                      </Button>
                    </div>
                  </>
                ) : isSplitting ? (
                  /* Splits Editor View */
                  <div className="space-y-4 sm:space-y-5">
                    <p className="text-xs sm:text-sm text-ink-muted leading-relaxed">
                      Divide{" "}
                      <span className="font-semibold text-foreground font-serif whitespace-nowrap">
                        {getCurrencySymbol()}{formatINR(expense.amount)}
                      </span>{" "}
                      across lines. They must add up to the total.
                    </p>

                    <div className="space-y-3">
                      {splitRows.map((row, idx) => (
                        <div
                          key={idx}
                          className="flex flex-col gap-3 sm:flex-row sm:items-stretch p-3 sm:p-3.5 bg-surface/40 rounded-2xl border border-border/20"
                        >
                          <div className="flex-1 space-y-2.5 min-w-0">
                            <div className="grid grid-cols-1 min-[400px]:grid-cols-2 gap-2.5 sm:gap-2">
                              <div className="min-w-0">
                                <Label className="text-[9px] sm:text-[10px] uppercase tracking-wider text-ink-muted font-medium">Category</Label>
                                <Select
                                  value={row.category}
                                  onValueChange={(val) => {
                                    setSplitRows((prev) => prev.map((r, i) => i === idx ? { ...r, category: val } : r));
                                  }}
                                >
                                  <SelectTrigger className="h-10 sm:h-9 rounded-lg mt-0.5 border-border bg-background text-xs sm:text-sm w-full">
                                    <SelectValue />
                                  </SelectTrigger>
                                  <SelectContent className="bg-popover max-h-[min(50vh,320px)]">
                                    {categories.map((c) => (
                                      <SelectItem key={c.name} value={c.name} className="text-xs sm:text-sm">{c.name}</SelectItem>
                                    ))}
                                  </SelectContent>
                                </Select>
                              </div>
                              <div className="min-w-0">
                                <Label className="text-[9px] sm:text-[10px] uppercase tracking-wider text-ink-muted font-medium">Amount</Label>
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
                                  className="h-10 sm:h-9 rounded-lg mt-0.5 bg-background border-border text-sm sm:text-base text-foreground font-serif min-h-[44px] sm:min-h-0"
                                />
                              </div>
                            </div>
                            <div>
                              <Label className="text-[9px] sm:text-[10px] uppercase tracking-wider text-ink-muted font-medium">Line note</Label>
                              <Input
                                type="text"
                                placeholder="Optional"
                                value={row.note}
                                onChange={(e) => {
                                  setSplitRows((prev) => prev.map((r, i) => i === idx ? { ...r, note: e.target.value } : r));
                                }}
                                className="h-10 sm:h-9 rounded-lg mt-0.5 bg-background border-border text-xs sm:text-sm text-foreground placeholder:text-ink-muted/50 min-h-[44px] sm:min-h-0"
                              />
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => handleRemoveSplitRow(idx)}
                            className="text-ink-muted hover:text-destructive rounded-xl border border-border/50 sm:border-0 p-2.5 sm:p-2 min-h-[44px] min-w-[44px] sm:min-h-0 sm:min-w-0 sm:mt-7 self-end sm:self-start shrink-0 flex items-center justify-center transition-colors"
                            aria-label="Remove line"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      ))}
                    </div>

                    <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:items-center bg-surface/30 px-3 sm:px-4 py-2.5 sm:py-3 rounded-xl border border-border/30">
                      <span className="text-xs sm:text-sm text-ink-muted">Total</span>
                      <span className={cn(
                        "font-serif font-semibold text-sm sm:text-base tabular-nums break-all sm:break-normal sm:text-right",
                        Math.abs(splitRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0) - expense.amount) < 0.01
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-destructive"
                      )}>
                        {getCurrencySymbol()}{formatINR(splitRows.reduce((s, r) => s + (parseFloat(r.amount) || 0), 0))}{" "}
                        <span className="text-ink-muted font-sans font-normal text-xs sm:text-sm"> / </span>
                        {getCurrencySymbol()}{formatINR(expense.amount)}
                      </span>
                    </div>

                    {error && (
                      <div className="flex items-start gap-2 text-xs sm:text-sm text-destructive bg-destructive/5 p-3 rounded-xl border border-destructive/20" role="alert">
                        <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
                        <span className="min-w-0">{error}</span>
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full flex-1 min-h-[48px] h-12 sm:h-11 text-xs sm:text-sm"
                        onClick={handleAddSplitRow}
                      >
                        <Plus className="h-4 w-4 mr-1.5 shrink-0" /> Add line
                      </Button>
                      <Button
                        type="button"
                        variant="outline"
                        className="rounded-full min-h-[48px] h-12 sm:h-11 sm:w-12 sm:px-0 shrink-0 inline-flex items-center justify-center gap-2 sm:gap-0"
                        onClick={() => {
                          setSplitRows([]);
                          setError(null);
                        }}
                        title="Clear all lines"
                      >
                        <RefreshCw className="h-4 w-4 shrink-0" />
                        <span className="text-xs sm:text-sm sm:hidden">Clear</span>
                      </Button>
                    </div>

                    <div className="grid grid-cols-1 min-[380px]:grid-cols-2 gap-2.5 sm:gap-3 pt-3 border-t border-border/20">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => { setIsSplitting(false); setError(null); }}
                        className="rounded-full min-h-[48px] h-12 sm:h-11 text-xs sm:text-sm w-full"
                      >
                        <X className="h-4 w-4 mr-1.5 shrink-0" /> Cancel
                      </Button>
                      <Button
                        type="button"
                        onClick={handleSaveSplits}
                        className="rounded-full min-h-[48px] h-12 sm:h-11 text-xs sm:text-sm w-full bg-foreground text-background hover:bg-foreground/90"
                      >
                        <Check className="h-4 w-4 mr-1.5 shrink-0" /> Save
                      </Button>
                    </div>
                  </div>
                ) : (
                  /* Edit Transaction Details View */
                  <>
                    <div className="bg-surface/60 rounded-3xl p-6 border border-border/40">
                      <div className="flex items-center gap-3">
                        <span className="font-serif text-4xl text-ink-muted/60">{getCurrencySymbol()}</span>
                        <Input
                          type="number"
                          inputMode="decimal"
                          step="0.01"
                          min="0"
                          value={amount}
                          onChange={(e) => { setAmount(e.target.value); setError(null); }}
                          className="font-serif text-5xl h-16 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 text-foreground"
                        />
                      </div>
                      <Input
                        type="text"
                        maxLength={120}
                        value={note}
                        onChange={(e) => setNote(e.target.value)}
                        placeholder="Add a note…"
                        className="mt-4 border-0 border-b border-border rounded-none bg-transparent px-0 text-base text-foreground placeholder:text-ink-muted shadow-none focus-visible:ring-0 focus-visible:border-foreground"
                      />
                      {(expense.type ?? "expense") === "expense" && (
                        <Input
                          type="text"
                          maxLength={200}
                          value={splitNote}
                          onChange={(e) => setSplitNote(e.target.value)}
                          placeholder="Split note (optional)"
                          className="mt-3 border-0 border-b border-border rounded-none bg-transparent px-0 text-sm text-foreground placeholder:text-ink-muted shadow-none focus-visible:ring-0"
                        />
                      )}
                    </div>

                    <div className="space-y-3">
                      <Label className="text-[10px] tracking-[0.2em] uppercase text-ink-muted font-medium">
                        Category
                      </Label>
                      <div className="flex flex-wrap gap-2">
                        {categories.map((c) => (
                          <button
                            key={c.name}
                            type="button"
                            onClick={() => { setCategory(c.name); setSubcategory(""); setError(null); }}
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
                      </div>
                    </div>

                    {/* Subcategory */}
                    {(subs.length > 0 || onAddSubcategory) && (
                      <div className="space-y-3">
                        <Label className="text-[10px] tracking-[0.2em] uppercase text-ink-muted font-medium">
                          Subcategory <span className="opacity-60 normal-case tracking-normal">(optional)</span>
                        </Label>
                        <div className="flex flex-wrap gap-2">
                          {subs.map((s) => (
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
                              className="px-3 py-1.5 rounded-full text-xs border border-dashed border-border text-ink-muted hover:bg-surface"
                            >
                              + New
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

                    <div className="space-y-2">
                      <Label
                        htmlFor="edit-date"
                        className="text-[10px] tracking-[0.2em] uppercase text-ink-muted font-medium"
                      >
                        Date
                      </Label>
                      <RollingDatePicker
                        value={date}
                        max={todayISO()}
                        onChange={(val) => { setDate(val); setError(null); }}
                      />
                    </div>

                    {error && (
                      <p className="text-xs text-destructive" role="alert">{error}</p>
                    )}

                    <div className="grid grid-cols-2 gap-3">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={cancelEdit}
                        className="rounded-full h-11"
                      >
                        <X className="h-4 w-4 mr-1" /> Cancel
                      </Button>
                      <Button
                        type="button"
                        onClick={save}
                        className="rounded-full h-11 bg-foreground text-background hover:bg-foreground/90"
                      >
                        <Check className="h-4 w-4 mr-1" /> Save
                      </Button>
                    </div>
                  </>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="bg-background border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-2xl font-normal">
              Delete this entry?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {expense
                ? `${getCurrencySymbol()}${formatINR(expense.amount)} · ${expense.category}${
                    expense.note ? ` · ${expense.note}` : ""
                  }. This can't be undone.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
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

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col gap-0.5 sm:flex-row sm:justify-between sm:items-baseline border-b border-border/40 pb-3">
      <dt className="text-[10px] sm:text-[11px] tracking-[0.18em] sm:tracking-[0.2em] uppercase text-ink-muted font-medium shrink-0">
        {label}
      </dt>
      <dd className="text-sm sm:text-base text-foreground capitalize text-left sm:text-right break-words">{value}</dd>
    </div>
  );
}