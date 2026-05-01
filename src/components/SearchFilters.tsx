import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { CategoryDef } from "@/lib/expenses";
import { Search, X } from "lucide-react";
import { cn } from "@/lib/utils";

export interface FilterState {
  query: string;
  category: string; // "" = all
  from: string;
  to: string;
}

interface Props {
  value: FilterState;
  onChange: (v: FilterState) => void;
  categories: CategoryDef[];
  resultsCount: number;
}

export function SearchFilters({ value, onChange, categories, resultsCount }: Props) {
  const set = (patch: Partial<FilterState>) => onChange({ ...value, ...patch });
  const hasFilters = value.query || value.category || value.from || value.to;

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
          <Input
            id="from"
            type="date"
            value={value.from}
            onChange={(e) => set({ from: e.target.value })}
            className="rounded-full bg-transparent border-border text-foreground text-sm"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="to" className="text-[10px] tracking-[0.2em] uppercase text-ink-muted font-medium">To</Label>
          <Input
            id="to"
            type="date"
            value={value.to}
            onChange={(e) => set({ to: e.target.value })}
            className="rounded-full bg-transparent border-border text-foreground text-sm"
          />
        </div>
      </div>

      <div className="flex items-center justify-between">
        <span className="text-[11px] text-ink-muted tracking-wider uppercase">
          {resultsCount} {resultsCount === 1 ? "result" : "results"}
        </span>
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
    </section>
  );
}