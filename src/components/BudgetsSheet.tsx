import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CategoryDef, formatINR } from "@/lib/expenses";
import { Budgets } from "@/hooks/useExpenses";
import { useEffect, useState } from "react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categories: CategoryDef[];
  budgets: Budgets;
  spentByCategory: Record<string, number>;
  onSetBudget: (category: string, amount: number | null) => void;
}

export function BudgetsSheet({
  open,
  onOpenChange,
  categories,
  budgets,
  spentByCategory,
  onSetBudget,
}: Props) {
  const [draft, setDraft] = useState<Record<string, string>>({});

  useEffect(() => {
    if (open) {
      const init: Record<string, string> = {};
      categories.forEach((c) => {
        init[c.name] = budgets[c.name] ? String(budgets[c.name]) : "";
      });
      setDraft(init);
    }
  }, [open, categories, budgets]);

  const save = () => {
    categories.forEach((c) => {
      const raw = (draft[c.name] ?? "").trim();
      if (!raw) {
        onSetBudget(c.name, null);
        return;
      }
      const n = parseFloat(raw);
      if (Number.isFinite(n) && n > 0) onSetBudget(c.name, n);
      else onSetBudget(c.name, null);
    });
    onOpenChange(false);
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="bg-background border-border rounded-t-[32px] max-h-[88vh] overflow-y-auto"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="font-serif text-3xl font-normal text-foreground">
            Monthly budgets
          </SheetTitle>
          <p className="text-xs text-ink-muted">
            Set a monthly limit per category. Leave blank to remove.
          </p>
        </SheetHeader>

        <div className="mt-6 space-y-4 pb-8">
          {categories.map((c) => {
            const spent = spentByCategory[c.name] || 0;
            return (
              <div
                key={c.name}
                className="bg-surface/60 border border-border/40 rounded-2xl p-4 flex items-center gap-3"
              >
                <div className="flex-1 min-w-0">
                  <Label
                    htmlFor={`budget-${c.name}`}
                    className="text-foreground text-sm"
                  >
                    {c.name}
                  </Label>
                  <p className="text-[11px] text-ink-muted tabular-nums">
                    Spent ₹{formatINR(spent)}
                  </p>
                </div>
                <div className="flex items-center gap-1">
                  <span className="text-ink-muted text-sm">₹</span>
                  <Input
                    id={`budget-${c.name}`}
                    type="number"
                    inputMode="decimal"
                    min="0"
                    placeholder="0"
                    value={draft[c.name] ?? ""}
                    onChange={(e) =>
                      setDraft((d) => ({ ...d, [c.name]: e.target.value }))
                    }
                    className="w-28 rounded-full bg-background border-border text-right tabular-nums"
                  />
                </div>
              </div>
            );
          })}

          <Button
            type="button"
            size="lg"
            onClick={save}
            className="w-full rounded-full bg-foreground text-background hover:bg-foreground/90 h-12 text-base font-medium"
          >
            Save budgets
          </Button>
        </div>
      </SheetContent>
    </Sheet>
  );
}