import { Expense, formatINR } from "@/lib/expenses";
import { Trash2 } from "lucide-react";

interface Props {
  expense: Expense;
  onDelete?: (id: string) => void;
  showDate?: boolean;
}

export function ExpenseRow({ expense, onDelete, showDate }: Props) {
  const time = new Date(expense.created_at).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const meta = [expense.category, expense.subcategory, expense.payment_method.toUpperCase()]
    .filter(Boolean)
    .join(" · ");

  return (
    <div className="group flex justify-between items-baseline px-2 py-2">
      <div className="flex gap-5 items-baseline min-w-0">
        <span className="text-ink-muted/60 text-xs w-10 text-right tabular-nums tracking-wider shrink-0">
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
          ₹{formatINR(expense.amount)}
        </span>
        {onDelete && (
          <button
            onClick={() => onDelete(expense.id)}
            aria-label="Delete expense"
            className="opacity-0 group-hover:opacity-100 transition-opacity text-ink-muted hover:text-destructive p-1"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
    </div>
  );
}