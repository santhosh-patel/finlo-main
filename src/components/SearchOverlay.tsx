import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { SearchFilters, FilterState } from "@/components/SearchFilters";
import { ExpenseRow } from "@/components/ExpenseRow";
import { CategoryDef, Expense, formatINR } from "@/lib/expenses";
import { useMemo } from "react";

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  expenses: Expense[];
  categories: CategoryDef[];
  filters: FilterState;
  onFiltersChange: (f: FilterState) => void;
  onSelect: (e: Expense) => void;
}

export function SearchOverlay({
  open,
  onOpenChange,
  expenses,
  categories,
  filters,
  onFiltersChange,
  onSelect,
}: Props) {
  const filtered = useMemo(() => {
    const q = filters.query.trim().toLowerCase();
    return expenses.filter((e) => {
      if (filters.category && e.category !== filters.category) return false;
      if (filters.from && e.date < filters.from) return false;
      if (filters.to && e.date > filters.to) return false;
      if (q) {
        const hay = [e.note, e.category, e.subcategory, e.payment_method]
          .filter(Boolean)
          .join(" ")
          .toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [expenses, filters]);

  const total = filtered.reduce((a, b) => a + b.amount, 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="right"
        className="bg-background border-border w-full sm:max-w-[520px] overflow-y-auto p-6"
      >
        <SheetHeader className="text-left mb-4">
          <SheetTitle className="font-serif text-3xl font-normal text-foreground">
            Search
          </SheetTitle>
          <p className="text-xs text-ink-muted">
            Searches across all your recorded expenses.
          </p>
        </SheetHeader>

        <SearchFilters
          value={filters}
          onChange={onFiltersChange}
          categories={categories}
          resultsCount={filtered.length}
        />

        {filtered.length > 0 && (
          <div className="flex items-baseline justify-between mb-4">
            <span className="text-[10px] tracking-[0.2em] uppercase text-ink-muted">
              Filtered total
            </span>
            <span className="font-serif text-xl text-foreground tabular-nums">
              ₹{formatINR(total)}
            </span>
          </div>
        )}

        {filtered.length === 0 ? (
          <p className="text-center text-ink-muted text-sm font-light max-w-xs mx-auto py-8">
            No expenses match your filters.
          </p>
        ) : (
          <div className="flex flex-col divide-y divide-border/50 pb-12">
            {filtered.map((e) => (
              <ExpenseRow
                key={e.id}
                expense={e}
                showDate
                onSelect={() => onSelect(e)}
              />
            ))}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}