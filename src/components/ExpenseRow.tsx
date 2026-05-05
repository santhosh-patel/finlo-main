import { getCurrencySymbol,  Expense, formatINR } from "@/lib/expenses";
import { Trash2 } from "lucide-react";
import { getIconForCategory, getColorForCategory } from "@/lib/categoryIcons";
import type { CategoryDef } from "@/lib/expenses";

interface Props {
  expense: Expense;
  onDelete?: (id: string) => void;
  onSelect?: (e: Expense) => void;
  showDate?: boolean;
  categories?: CategoryDef[];
}

export function ExpenseRow({ expense, onDelete, onSelect, showDate, categories }: Props) {
  const def = categories?.find((c) => c.name === expense.category);
  const Icon = getIconForCategory(expense.category, def?.icon);
  const bgColor = getColorForCategory(expense.category, def?.color);
  const time = new Date(expense.created_at).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const meta = [expense.category, expense.subcategory, expense.payment_method.toUpperCase()]
    .filter(Boolean)
    .join(" · ");

  const Wrapper: any = onSelect ? "button" : "div";

  return (
    <Wrapper
      {...(onSelect
        ? {
            type: "button",
            onClick: () => onSelect(expense),
            "aria-label": `View ${expense.note || expense.category} ${getCurrencySymbol()}${formatINR(expense.amount)}`,
          }
        : {})}
      className={
        "group flex justify-between items-baseline px-2 py-2 w-full text-left transition-colors " +
        (onSelect ? "hover:bg-surface/50 rounded-xl cursor-pointer" : "")
      }
    >
      <div className="flex gap-5 items-baseline min-w-0">
        <span
          className="h-7 w-7 rounded-full flex items-center justify-center shrink-0 self-center"
          style={{ backgroundColor: bgColor }}
          aria-hidden
        >
          <Icon className="h-3.5 w-3.5 text-foreground" />
        </span>
        <span className="text-ink-muted/60 text-[11px] w-10 text-right tabular-nums tracking-wider shrink-0 self-center">
          {showDate
            ? new Date(expense.date + "T00:00:00").toLocaleDateString("en-US", {
                month: "short",
                day: "numeric",
              })
            : time}
        </span>
        <div className="min-w-0">
          <div className="text-foreground text-base font-light truncate">
            {expense.note || expense.category}
          </div>
          <div className="text-ink-muted text-[11px] tracking-wide truncate">
            {meta}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3 shrink-0">
        <span className="font-serif text-2xl text-foreground tabular-nums">
          {getCurrencySymbol()}{formatINR(expense.amount)}
        </span>
        {onDelete && (
          <span
            role="button"
            tabIndex={0}
            onClick={(e) => { e.stopPropagation(); onDelete(expense.id); }}
            onKeyDown={(e) => {
              if (e.key === "Enter" || e.key === " ") {
                e.stopPropagation();
                onDelete(expense.id);
              }
            }}
            aria-label="Delete expense"
            className="opacity-0 group-hover:opacity-100 transition-opacity text-ink-muted hover:text-destructive p-1 inline-flex"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </span>
        )}
      </div>
    </Wrapper>
  );
}