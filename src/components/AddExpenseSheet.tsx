import { useEffect, useMemo, useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/utils";
import {
  CategoryDef,
  Expense,
  PAYMENT_METHODS,
  PaymentMethod,
  todayISO,
} from "@/lib/expenses";
import { Plus } from "lucide-react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categories: CategoryDef[];
  onAdd: (e: Omit<Expense, "id" | "created_at">) => void;
  onAddCategory: (name: string) => void;
}

export function AddExpenseSheet({ open, onOpenChange, categories, onAdd, onAddCategory }: Props) {
  const [amount, setAmount] = useState("");
  const [category, setCategory] = useState<string>(categories[0]?.name ?? "Food");
  const [subcategory, setSubcategory] = useState<string>("");
  const [note, setNote] = useState("");
  const [date, setDate] = useState(todayISO());
  const [payment, setPayment] = useState<PaymentMethod>("upi");
  const [newCat, setNewCat] = useState("");
  const [showAddCat, setShowAddCat] = useState(false);
  const amountRef = useRef<HTMLInputElement>(null);

  const subs = useMemo(
    () => categories.find((c) => c.name === category)?.subcategories ?? [],
    [category, categories]
  );

  useEffect(() => {
    if (open) {
      setAmount("");
      setSubcategory("");
      setNote("");
      setDate(todayISO());
      setPayment("upi");
      setShowAddCat(false);
      setNewCat("");
      // focus amount on open
      setTimeout(() => amountRef.current?.focus(), 80);
    }
  }, [open]);

  const submit = (e?: React.FormEvent) => {
    e?.preventDefault();
    const num = parseFloat(amount);
    if (!num || num <= 0) return;
    if (!category) return;
    onAdd({
      amount: num,
      category,
      subcategory: subcategory || undefined,
      note: note.trim() || undefined,
      date,
      payment_method: payment,
    });
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
            New entry
          </SheetTitle>
        </SheetHeader>

        <form onSubmit={submit} className="mt-6 space-y-8 pb-8">
          {/* Amount */}
          <div className="bg-surface/60 rounded-3xl p-6 border border-border/40">
            <div className="flex items-center gap-3">
              <span className="font-serif text-4xl text-ink-muted/60">₹</span>
              <Input
                ref={amountRef}
                type="number"
                inputMode="decimal"
                step="0.01"
                min="0"
                placeholder="0.00"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="font-serif text-5xl h-16 border-0 bg-transparent p-0 shadow-none focus-visible:ring-0 placeholder:text-ink-muted/30 text-foreground"
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

          {/* Categories */}
          <div className="space-y-3">
            <Label className="text-[10px] tracking-[0.2em] uppercase text-ink-muted font-medium">
              Category
            </Label>
            <div className="flex flex-wrap gap-2">
              {categories.map((c) => (
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
          </div>

          {/* Subcategory */}
          {subs.length > 0 && (
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
                className="rounded-full bg-transparent border-border text-foreground"
              />
            </div>
          </div>

          <Button
            type="submit"
            size="lg"
            className="w-full rounded-full bg-foreground text-background hover:bg-foreground/90 h-12 text-base font-medium"
          >
            Save entry
          </Button>
        </form>
      </SheetContent>
    </Sheet>
  );
}