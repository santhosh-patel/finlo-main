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
import {
  CategoryDef,
  Expense,
  formatINR,
  fullDateLabel,
  todayISO,
} from "@/lib/expenses";
import { Check, Pencil, Trash2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  expense: Expense | null;
  categories: CategoryDef[];
  onOpenChange: (open: boolean) => void;
  onUpdate: (id: string, patch: Partial<Omit<Expense, "id" | "created_at">>) => void;
  onDelete: (id: string) => void;
  onAddSubcategory?: (category: string, sub: string) => void;
}

export function ExpenseDetailsDrawer({
  expense,
  categories,
  onOpenChange,
  onUpdate,
  onDelete,
  onAddSubcategory,
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
  const [error, setError] = useState<string | null>(null);
  const open = !!expense;

  const subs = categories.find((c) => c.name === category)?.subcategories ?? [];

  useEffect(() => {
    if (expense) {
      setAmount(String(expense.amount));
      setCategory(expense.category);
      setSubcategory(expense.subcategory ?? "");
      setDate(expense.date);
      setNote(expense.note ?? "");
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
    }
    setError(null);
    setEditing(false);
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="bg-background border-border rounded-t-[32px] max-h-[80vh] overflow-y-auto"
        >
          {expense && (
            <>
              <SheetHeader className="text-left">
                <SheetTitle className="font-serif text-3xl font-normal text-foreground">
                  {editing ? "Edit entry" : "Entry"}
                </SheetTitle>
              </SheetHeader>

              <div className="mt-6 space-y-8 pb-6">
                {!editing ? (
                  <>
                    <div className="bg-surface/60 rounded-3xl p-6 border border-border/40 text-center">
                      <div className="font-serif text-6xl text-foreground tabular-nums">
                        <span className="text-ink-muted/40 text-3xl mr-1">₹</span>
                        {formatINR(expense.amount)}
                      </div>
                      {expense.note && (
                        <p className="mt-3 text-foreground text-sm">{expense.note}</p>
                      )}
                    </div>

                    <dl className="space-y-4 text-sm">
                      <Row label="Category" value={expense.category} />
                      {expense.subcategory && (
                        <Row label="Subcategory" value={expense.subcategory} />
                      )}
                      <Row label="Date" value={fullDateLabel(expense.date)} />
                      <Row label="Payment" value={expense.payment_method.toUpperCase()} />
                    </dl>

                    <div className="grid grid-cols-2 gap-3">
                      <Button
                        type="button"
                        variant="secondary"
                        onClick={() => setEditing(true)}
                        className="rounded-full h-11"
                      >
                        <Pencil className="h-4 w-4 mr-1" /> Edit
                      </Button>
                      <Button
                        type="button"
                        variant="destructive"
                        onClick={() => setConfirmOpen(true)}
                        className="rounded-full h-11"
                      >
                        <Trash2 className="h-4 w-4 mr-1" /> Delete
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <div className="bg-surface/60 rounded-3xl p-6 border border-border/40">
                      <div className="flex items-center gap-3">
                        <span className="font-serif text-4xl text-ink-muted/60">₹</span>
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
                      <Input
                        id="edit-date"
                        type="date"
                        value={date}
                        max={todayISO()}
                        onChange={(e) => { setDate(e.target.value); setError(null); }}
                        className="rounded-full bg-transparent border-border text-foreground"
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
                ? `₹${formatINR(expense.amount)} · ${expense.category}${
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
    <div className="flex justify-between items-baseline border-b border-border/40 pb-3">
      <dt className="text-[10px] tracking-[0.2em] uppercase text-ink-muted font-medium">
        {label}
      </dt>
      <dd className="text-foreground capitalize">{value}</dd>
    </div>
  );
}