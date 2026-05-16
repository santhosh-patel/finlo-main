import { getCurrencySymbol, Expense, formatINR, baseAmountOf } from "@/lib/expenses";
import { CURRENCY_SYMBOLS, getBaseCurrency } from "@/lib/fx";
import { Trash2, Users, AlertTriangle, Pencil, Heart } from "lucide-react";
import { getIconForCategory, getColorForCategory } from "@/lib/categoryIcons";
import type { CategoryDef } from "@/lib/expenses";
import { cn, vibrate } from "@/lib/utils";
import { useRef, useState } from "react";

interface Props {
  expense: Expense;
  onDelete?: (id: string) => void;
  onSelect?: (e: Expense) => void;
  showDate?: boolean;
  categories?: CategoryDef[];
  /** Unusually high vs typical spend in this category */
  showAnomaly?: boolean;
  currentUserId?: string | null;
  onToggleReaction?: (id: string, emoji: string) => void;
}

export function ExpenseRow({ expense, onDelete, onSelect, showDate, categories, showAnomaly, currentUserId, onToggleReaction }: Props) {
  const def = categories?.find((c) => c.name === expense.category);
  const Icon = getIconForCategory(expense.category, def?.icon);
  const bgColor = getColorForCategory(expense.category, def?.color);
  const time = new Date(expense.created_at).toLocaleTimeString("en-US", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });

  const isIncome = expense.type === "income";
  // Only show partner badge/reactions when we have a currentUserId, the expense has a user_id, and they differ
  const isPartnerExpense = !!(currentUserId && expense.user_id && expense.user_id !== currentUserId);

  const meta = [expense.category, expense.subcategory, expense.payment_method.toUpperCase()]
    .filter(Boolean)
    .join(" · ");

  const hasReacted = (emoji: string) =>
    expense.reactions?.some((r) => r.user_id === currentUserId && r.emoji === emoji) ?? false;

  // Gesture swiping
  const [swipeOffset, setSwipeOffset] = useState<number>(0);
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const touchStartXRef = useRef<number>(0);
  const touchStartYRef = useRef<number>(0);
  const isSwipeConfirmedRef = useRef<boolean>(false);

  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartXRef.current = e.touches[0].clientX;
    touchStartYRef.current = e.touches[0].clientY;
    setIsDragging(true);
    isSwipeConfirmedRef.current = false;
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging) return;
    const deltaX = e.touches[0].clientX - touchStartXRef.current;
    const deltaY = e.touches[0].clientY - touchStartYRef.current;
    if (!isSwipeConfirmedRef.current) {
      if (Math.abs(deltaY) > Math.abs(deltaX)) { setIsDragging(false); return; }
      if (Math.abs(deltaX) > 8) isSwipeConfirmedRef.current = true;
    }
    if (isSwipeConfirmedRef.current) {
      if (e.cancelable) e.preventDefault();
      let offset = deltaX;
      if (offset > 100) offset = 100 + (offset - 100) * 0.35;
      else if (offset < -100) offset = -100 + (offset + 100) * 0.35;
      setSwipeOffset(offset);
    }
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
    if (isSwipeConfirmedRef.current) {
      if (swipeOffset < -70) { vibrate(15); onDelete?.(expense.id); }
      else if (swipeOffset > 70) { vibrate(15); onSelect?.(expense); }
    }
    setSwipeOffset(0);
    isSwipeConfirmedRef.current = false;
  };

  const Wrapper: "button" | "div" = onSelect ? "button" : "div";

  return (
    <div className="relative overflow-hidden rounded-xl w-full">
      {/* Swipe underlays */}
      {swipeOffset > 0 && (
        <div className="absolute inset-y-0 left-0 w-24 bg-indigo-600/90 dark:bg-indigo-500/95 flex items-center pl-5 text-white rounded-l-xl pointer-events-none select-none z-0">
          <Pencil className="h-4 w-4 stroke-[2.5]" />
          <span className="text-[10px] uppercase font-bold tracking-wider ml-1.5">Edit</span>
        </div>
      )}
      {swipeOffset < 0 && (
        <div className="absolute inset-y-0 right-0 w-24 bg-rose-600/95 flex items-center justify-end pr-5 text-white rounded-r-xl pointer-events-none select-none z-0">
          <span className="text-[10px] uppercase font-bold tracking-wider mr-1.5">Delete</span>
          <Trash2 className="h-4 w-4 stroke-[2.5]" />
        </div>
      )}

      {/* Front panel */}
      <div
        className="relative z-10 w-full"
        style={{
          transform: swipeOffset !== 0 ? `translateX(${swipeOffset}px)` : undefined,
          transition: isDragging ? "none" : "transform 0.28s cubic-bezier(0.175, 0.885, 0.32, 1.275)",
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <Wrapper
          {...(onSelect
            ? {
                type: "button",
                onClick: () => { if (Math.abs(swipeOffset) < 5) onSelect(expense); },
                "aria-label": `View ${expense.note || expense.category} ${getCurrencySymbol()}${formatINR(expense.amount)}`,
              }
            : {})}
          className={cn(
            "group flex flex-col px-3 py-2.5 w-full text-left transition-colors bg-background",
            onSelect ? "hover:bg-surface/50 rounded-xl cursor-pointer" : ""
          )}
        >
          {/* Main row */}
          <div className="flex justify-between items-center w-full">
            <div className="flex gap-3 items-center min-w-0 flex-1">
              {/* Category icon with optional partner badge */}
              <div className="relative shrink-0">
                <span
                  className="h-7 w-7 rounded-full flex items-center justify-center"
                  style={{ backgroundColor: bgColor }}
                  aria-hidden
                >
                  <Icon className="h-3.5 w-3.5 text-foreground" />
                </span>
                {isPartnerExpense && (
                  <span
                    className="absolute -bottom-0.5 -right-0.5 h-3.5 w-3.5 rounded-full bg-foreground text-background text-[6px] font-bold flex items-center justify-center border border-background shadow-sm"
                    title="Added by partner"
                    aria-label="Added by partner"
                  >
                    P
                  </span>
                )}
              </div>

              {/* Time or date */}
              <span className="text-ink-muted/60 text-[11px] w-10 text-right tabular-nums tracking-wider shrink-0">
                {showDate
                  ? new Date(expense.date.split("T")[0] + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" })
                  : time}
              </span>

              {/* Note + meta */}
              <div className="min-w-0">
                <div className="text-foreground text-base font-light truncate">
                  {expense.note || expense.category}
                </div>
                <div className="text-ink-muted text-[11px] tracking-wide truncate">{meta}</div>
              </div>
            </div>

            {/* Amount + badges */}
            <div className="flex items-center gap-2 shrink-0">
              <div className="flex items-center gap-1">
                {showAnomaly && (
                  <span title="Higher than usual for this category" className="text-amber-600 dark:text-amber-400">
                    <AlertTriangle className="h-3.5 w-3.5" strokeWidth={2} aria-hidden />
                  </span>
                )}
                {(expense.is_reimbursable || !!expense.split_note?.trim()) && (
                  <Users className="h-3.5 w-3.5 text-amber-700/75 dark:text-amber-400/85 shrink-0" aria-label="Split / reimbursable" />
                )}
              </div>
              <div className="flex flex-col items-end">
                <span className={cn(
                  "font-serif text-2xl tabular-nums",
                  isIncome ? "text-emerald-600 dark:text-emerald-400" : "text-foreground"
                )}>
                  {isIncome ? "+" : ""}{getCurrencySymbol()}{formatINR(baseAmountOf(expense))}
                </span>
                {expense.currency && expense.currency !== getBaseCurrency() && (
                  <span className="text-[10px] text-ink-muted tabular-nums">
                    {CURRENCY_SYMBOLS[expense.currency] ?? expense.currency}{formatINR(expense.amount)} {expense.currency}
                  </span>
                )}
              </div>
              {onDelete && (
                <span
                  role="button"
                  tabIndex={0}
                  onClick={(e) => { e.stopPropagation(); onDelete(expense.id); }}
                  onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); onDelete(expense.id); } }}
                  aria-label="Delete expense"
                  className="opacity-0 group-hover:opacity-100 transition-opacity text-ink-muted hover:text-destructive p-1 inline-flex max-md:hidden"
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </span>
              )}
            </div>
          </div>

          {/* Reactions row */}
          {(expense.reactions?.length ?? 0) > 0 && (
            <div className="flex flex-wrap gap-1 mt-1.5 pl-[76px]">
              {expense.reactions?.map((r, i) => (
                <span key={i} className="inline-flex items-center justify-center h-5 px-1.5 rounded-full bg-surface text-[10px] border border-border/20">
                  {r.emoji}
                </span>
              ))}
            </div>
          )}

          {/* Collaborative reaction buttons — only for partner's transactions */}
          {isPartnerExpense && onToggleReaction && (
            <div className="flex gap-2 mt-1.5 pl-[76px] opacity-0 group-hover:opacity-100 focus-within:opacity-100 transition-opacity">
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onToggleReaction(expense.id, "❤️"); }}
                className={cn(
                  "h-6 px-2 rounded-full border text-[10px] font-medium flex items-center gap-1 transition-colors",
                  hasReacted("❤️")
                    ? "bg-rose-50 border-rose-200 text-rose-600 dark:bg-rose-950/30 dark:border-rose-900/50 dark:text-rose-400"
                    : "bg-background border-border text-ink-muted hover:border-foreground hover:text-foreground"
                )}
                aria-label="React with love"
                aria-pressed={hasReacted("❤️")}
              >
                <Heart className="h-3 w-3" fill={hasReacted("❤️") ? "currentColor" : "none"} />
                Nice
              </button>
              <button
                type="button"
                onClick={(e) => { e.stopPropagation(); onToggleReaction(expense.id, "✅"); }}
                className={cn(
                  "h-6 px-2 rounded-full border text-[10px] font-medium flex items-center gap-1 transition-colors",
                  hasReacted("✅")
                    ? "bg-emerald-50 border-emerald-200 text-emerald-600 dark:bg-emerald-950/30 dark:border-emerald-900/50 dark:text-emerald-400"
                    : "bg-background border-border text-ink-muted hover:border-foreground hover:text-foreground"
                )}
                aria-label="Mark as paid"
                aria-pressed={hasReacted("✅")}
              >
                Paid
              </button>
            </div>
          )}
        </Wrapper>
      </div>
    </div>
  );
}