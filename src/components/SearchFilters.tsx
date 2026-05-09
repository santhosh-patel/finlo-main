import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CategoryDef, startOfMonthISO, startOfWeekISO, todayISO } from "@/lib/expenses";
import { Download, RotateCcw, Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

import { RollingDatePicker } from "./RollingDatePicker";

export interface FilterState {
  query: string;
  category: string; // "" = all
  from: string;
  to: string;
  reimbursableOnly?: boolean;
}

interface Props {
  value: FilterState;
  onChange: (v: FilterState) => void;
  categories: CategoryDef[];
  resultsCount: number;
  onExport?: () => void;
}

export function SearchFilters({ value, onChange, categories, resultsCount, onExport }: Props) {
  const set = (patch: Partial<FilterState>) => onChange({ ...value, ...patch });
  const hasFilters = value.query || value.category || value.from || value.to || value.reimbursableOnly;

  const today = todayISO();
  const weekStart = startOfWeekISO();
  const monthStart = startOfMonthISO();

  const isRange = (from: string, to: string) =>
    value.from === from && value.to === to;

  const quickChips: { label: string; active: boolean; apply: () => void }[] = [
    {
      label: "Today",
      active: isRange(today, today) && !value.category && !value.reimbursableOnly,
      apply: () => set({ from: today, to: today, category: "", reimbursableOnly: false }),
    },
    {
      label: "This week",
      active: isRange(weekStart, today) && !value.category && !value.reimbursableOnly,
      apply: () => set({ from: weekStart, to: today, category: "", reimbursableOnly: false }),
    },
    {
      label: "This month",
      active: isRange(monthStart, today) && !value.category && !value.reimbursableOnly,
      apply: () => set({ from: monthStart, to: today, category: "", reimbursableOnly: false }),
    },
    {
      label: "Reimbursable",
      active: !!value.reimbursableOnly,
      apply: () => set({ reimbursableOnly: !value.reimbursableOnly }),
    },
    {
      label: "Food",
      active: value.category === "Food",
      apply: () => set({ category: value.category === "Food" ? "" : "Food" }),
    },
    {
      label: "Bills",
      active: value.category === "Bills",
      apply: () => set({ category: value.category === "Bills" ? "" : "Bills" }),
    },
  ];

  return (
    <section className="space-y-4 mb-8">
      <div className="relative">
        <Search className="h-4 w-4 text-ink-muted absolute left-4 top-1/2 -translate-y-1/2" />
        <Input
          value={value.query}
          onChange={(e) => set({ query: e.target.value })}
          placeholder="Search notes, category, subcategory…"
          className="pl-10 pr-10 rounded-full bg-surface/60 border-border text-foreground"
        />
        {value.query && (
          <button
            type="button"
            onClick={() => set({ query: "" })}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-muted hover:text-foreground p-1"
            aria-label="Clear search"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        )}
      </div>

      {/* Quick chips */}
      <div className="flex flex-wrap gap-2 items-center">
        {quickChips.map((c) => (
          <button
            key={c.label}
            type="button"
            onClick={c.apply}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs border transition-colors",
              c.active
                ? "bg-foreground text-background border-foreground"
                : "bg-wash-clay/30 border-border/60 text-ink-muted hover:bg-surface"
            )}
          >
            {c.label}
          </button>
        ))}
        {(value.category || value.from || value.to || value.reimbursableOnly) && (
          <button
            type="button"
            onClick={() => set({ category: "", from: "", to: "", reimbursableOnly: false })}
            className="px-3 py-1.5 rounded-full text-xs border border-dashed border-border text-ink-muted hover:bg-surface inline-flex items-center gap-1"
            aria-label="Reset chips and date range"
          >
            <RotateCcw className="h-3 w-3" /> Reset
          </button>
        )}
      </div>

      <div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={() => set({ category: "" })}
            className={cn(
              "px-3 py-1.5 rounded-full text-xs border transition-colors",
              value.category === ""
                ? "bg-foreground text-background border-foreground"
                : "border-border text-ink-muted hover:bg-surface"
            )}
          >
            All
          </button>
          {categories.map((c) => (
            <button
              key={c.name}
              type="button"
              onClick={() => set({ category: value.category === c.name ? "" : c.name })}
              className={cn(
                "px-3 py-1.5 rounded-full text-xs border transition-colors",
                value.category === c.name
                  ? "bg-foreground text-background border-foreground"
                  : "border-border text-ink-muted hover:bg-surface"
              )}
            >
              {c.name}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="from" className="text-[10px] tracking-[0.2em] uppercase text-ink-muted font-medium">From</Label>
          <RollingDatePicker
            value={value.from}
            onChange={(val) => set({ from: val })}
            placeholder="Start date"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="to" className="text-[10px] tracking-[0.2em] uppercase text-ink-muted font-medium">To</Label>
          <RollingDatePicker
            value={value.to}
            onChange={(val) => set({ to: val })}
            placeholder="End date"
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-ink-muted tracking-wider uppercase">
          {resultsCount} {resultsCount === 1 ? "result" : "results"}
        </span>
        <div className="flex items-center gap-1">
          {onExport && resultsCount > 0 && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={onExport}
              className="text-xs text-ink-muted hover:text-foreground h-7"
            >
              <Download className="h-3.5 w-3.5 mr-1" /> Export CSV
            </Button>
          )}
          {hasFilters && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onChange({ query: "", category: "", from: "", to: "" })}
              className="text-xs text-ink-muted hover:text-foreground h-7"
            >
              Clear filters
            </Button>
          )}
        </div>
      </div>
    </section>
  );
}