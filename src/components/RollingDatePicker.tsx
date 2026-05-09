import React, { useState, useEffect, useRef, useMemo } from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Calendar, ChevronDown } from "lucide-react";

/** Above popovers; portaled to body. z from `--finlo-z-date-overlay` in index.css */

interface RollingDatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  className?: string;
  max?: string; // YYYY-MM-DD
  placeholder?: string;
}

const MONTHS_SHORT = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"
];

function getDaysInMonth(month: number, year: number): number {
  return new Date(year, month + 1, 0).getDate();
}

export function RollingDatePicker({ value, onChange, className, max, placeholder }: RollingDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  
  // Parse initial date
  const initialDate = useMemo(() => {
    if (!value) return new Date();
    const parsed = new Date(value + "T00:00:00");
    return isNaN(parsed.getTime()) ? new Date() : parsed;
  }, [value]);

  const [tempMonth, setTempMonth] = useState(initialDate.getMonth());
  const [tempDay, setTempDay] = useState(initialDate.getDate());
  const [tempYear, setTempYear] = useState(initialDate.getFullYear());

  const monthRef = useRef<HTMLDivElement>(null);
  const dayRef = useRef<HTMLDivElement>(null);
  const yearRef = useRef<HTMLDivElement>(null);

  const ITEM_HEIGHT = 40; // px height of each roll item

  // Years range
  const years = useMemo(() => {
    const currentYear = new Date().getFullYear();
    const list: number[] = [];
    for (let y = currentYear - 6; y <= currentYear + 10; y++) {
      list.push(y);
    }
    return list;
  }, []);

  const maxDate = useMemo(() => {
    if (!max) return null;
    const parsed = new Date(max + "T00:00:00");
    return isNaN(parsed.getTime()) ? null : parsed;
  }, [max]);

  // Total days in selected month/year
  const daysCount = useMemo(() => {
    return getDaysInMonth(tempMonth, tempYear);
  }, [tempMonth, tempYear]);

  const days = useMemo(() => {
    const list: number[] = [];
    for (let d = 1; d <= daysCount; d++) {
      list.push(d);
    }
    return list;
  }, [daysCount]);

  // Adjust tempDay if it exceeds max days in month
  useEffect(() => {
    if (tempDay > daysCount) {
      setTempDay(daysCount);
    }
  }, [daysCount, tempDay]);

  // Handle outside click to close
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest(".rolling-picker-modal") === null && target.closest(".rolling-picker-trigger") === null) {
        setIsOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setIsOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [isOpen]);

  // Sync temp variables with active value when opening
  useEffect(() => {
    if (isOpen) {
      setTempMonth(initialDate.getMonth());
      setTempDay(initialDate.getDate());
      setTempYear(initialDate.getFullYear());
    }
  }, [isOpen, initialDate]);

  // Scroll to active index
  const scrollTo = (ref: React.RefObject<HTMLDivElement | null>, index: number) => {
    if (ref.current) {
      ref.current.scrollTop = index * ITEM_HEIGHT;
    }
  };

  // Center wheels on open or temp changes
  useEffect(() => {
    if (isOpen) {
      // Small timeout to allow render and scroll refs to settle
      const timer = setTimeout(() => {
        scrollTo(monthRef, tempMonth);
        scrollTo(dayRef, tempDay - 1);
        const yearIndex = years.indexOf(tempYear);
        if (yearIndex !== -1) {
          scrollTo(yearRef, yearIndex);
        }
      }, 50);
      return () => clearTimeout(timer);
    }
  }, [isOpen, tempMonth, tempDay, tempYear, years]);

  // Format date for button display
  const displayLabel = useMemo(() => {
    if (!value) return placeholder || "Select Date";
    const date = new Date(value + "T00:00:00");
    if (isNaN(date.getTime())) return placeholder || "Select Date";
    return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
  }, [value, placeholder]);

  // Handle scroll snap updates
  const handleScroll = (
    ref: React.RefObject<HTMLDivElement | null>,
    type: "month" | "day" | "year",
    itemsLength: number
  ) => {
    if (!ref.current) return;
    const scrollTop = ref.current.scrollTop;
    const index = Math.round(scrollTop / ITEM_HEIGHT);
    const clampedIndex = Math.max(0, Math.min(index, itemsLength - 1));

    if (type === "month" && clampedIndex !== tempMonth) {
      setTempMonth(clampedIndex);
    } else if (type === "day" && (clampedIndex + 1) !== tempDay) {
      setTempDay(clampedIndex + 1);
    } else if (type === "year" && years[clampedIndex] !== tempYear) {
      setTempYear(years[clampedIndex]);
    }
  };

  const handleConfirm = () => {
    const formattedMonth = String(tempMonth + 1).padStart(2, "0");
    const formattedDay = String(tempDay).padStart(2, "0");
    const selectedDateStr = `${tempYear}-${formattedMonth}-${formattedDay}`;

    // Apply max bounds if specified
    if (maxDate) {
      const selectedDate = new Date(selectedDateStr + "T00:00:00");
      if (selectedDate > maxDate) {
        onChange(max);
        setIsOpen(false);
        return;
      }
    }

    onChange(selectedDateStr);
    setIsOpen(false);
  };

  return (
    <div className="relative inline-block w-full">
      {/* Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={cn(
          "rolling-picker-trigger flex items-center justify-between w-full px-4 h-10 rounded-full border border-border/60 bg-background hover:bg-surface/50 text-foreground text-sm transition-[color,background-color,transform,box-shadow] duration-200 ease-out cursor-pointer active:scale-[0.99]",
          className
        )}
      >
        <span className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-ink-muted shrink-0" />
          <span className="truncate">{displayLabel}</span>
        </span>
        <ChevronDown className="h-4 w-4 text-ink-muted shrink-0" />
      </button>

      {/* Portaled so z-index beats bottom nav and parent sheets don’t clip fixed */}
      {isOpen &&
        createPortal(
          <div
            className="rolling-picker-modal fixed inset-0 flex items-end sm:items-center justify-center p-3 sm:p-4 pt-8 sm:pt-4 bg-black/45 backdrop-blur-sm motion-safe:animate-in motion-safe:fade-in-0 motion-safe:duration-300"
            style={{ zIndex: "var(--finlo-z-date-overlay, 85)" }}
            role="dialog"
            aria-modal="true"
            aria-labelledby="rolling-date-picker-title"
            onClick={() => setIsOpen(false)}
          >
            <div
              className={cn(
                "w-full max-w-sm max-h-[min(92dvh,720px)] overflow-y-auto overscroll-contain",
                "bg-background/95 border border-border/80 rounded-t-[28px] sm:rounded-[28px] shadow-[0_-8px_40px_-12px_rgba(0,0,0,0.35)] sm:shadow-2xl",
                "flex flex-col gap-5 sm:gap-6",
                "p-5 sm:p-6",
                "pb-[max(1.25rem,calc(env(safe-area-inset-bottom,0px)+1rem))] sm:pb-6",
                "motion-safe:animate-in motion-safe:fade-in-0 motion-safe:zoom-in-95 motion-safe:slide-in-from-bottom-6",
                "motion-safe:duration-300 motion-safe:ease-[cubic-bezier(0.22,1,0.36,1)]",
              )}
              onClick={(e) => e.stopPropagation()}
            >
              <div
                className="mx-auto h-1 w-10 shrink-0 rounded-full bg-border/70 sm:hidden"
                aria-hidden
              />

              {/* Header */}
              <div className="flex items-center justify-between gap-3 border-b border-border/30 pb-3">
                <span
                  id="rolling-date-picker-title"
                  className="text-sm font-semibold tracking-wide text-foreground uppercase"
                >
                  Select date
                </span>
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="text-xs font-semibold text-ink-muted hover:text-foreground transition-colors duration-200 min-h-9 min-w-9 sm:min-h-0 sm:min-w-0 rounded-full hover:bg-surface/80 -mr-1 px-2"
                >
                  Cancel
                </button>
              </div>

              {/* Rolling Wheel Interface */}
              <div className="relative h-[180px] bg-surface/30 rounded-2xl border border-border/40 overflow-hidden flex shadow-inner">

                <div className="absolute inset-x-0 top-[70px] h-10 border-y border-foreground/10 bg-foreground/[0.06] pointer-events-none rounded-sm transition-colors duration-200" />

                <div
                  className="absolute inset-0 pointer-events-none bg-gradient-to-b from-background via-transparent to-background opacity-95"
                  style={{ backgroundSize: "100% 180px" }}
                />

                <div
                  ref={monthRef}
                  onScroll={() => handleScroll(monthRef, "month", MONTHS_SHORT.length)}
                  className="flex-1 overflow-y-auto snap-y snap-mandatory scrollbar-none scroll-smooth py-[70px] [scroll-behavior:smooth]"
                  style={{ height: "180px" }}
                >
                  {MONTHS_SHORT.map((m, idx) => (
                    <div
                      key={m}
                      onClick={() => { setTempMonth(idx); scrollTo(monthRef, idx); }}
                      className={cn(
                        "h-10 flex items-center justify-center text-sm font-medium snap-center cursor-pointer select-none",
                        "transition-[transform,color,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                        tempMonth === idx ? "text-foreground font-bold scale-105 opacity-100" : "text-ink-muted/45 scale-100 opacity-70",
                      )}
                    >
                      {m}
                    </div>
                  ))}
                </div>

                <div
                  ref={dayRef}
                  onScroll={() => handleScroll(dayRef, "day", days.length)}
                  className="flex-1 overflow-y-auto snap-y snap-mandatory scrollbar-none scroll-smooth py-[70px] [scroll-behavior:smooth]"
                  style={{ height: "180px" }}
                >
                  {days.map((d, idx) => (
                    <div
                      key={d}
                      onClick={() => { setTempDay(d); scrollTo(dayRef, idx); }}
                      className={cn(
                        "h-10 flex items-center justify-center text-sm font-medium snap-center cursor-pointer select-none",
                        "transition-[transform,color,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                        tempDay === d ? "text-foreground font-bold scale-105 opacity-100" : "text-ink-muted/45 scale-100 opacity-70",
                      )}
                    >
                      {d}
                    </div>
                  ))}
                </div>

                <div
                  ref={yearRef}
                  onScroll={() => handleScroll(yearRef, "year", years.length)}
                  className="flex-1 overflow-y-auto snap-y snap-mandatory scrollbar-none scroll-smooth py-[70px] [scroll-behavior:smooth]"
                  style={{ height: "180px" }}
                >
                  {years.map((y, idx) => (
                    <div
                      key={y}
                      onClick={() => { setTempYear(y); scrollTo(yearRef, idx); }}
                      className={cn(
                        "h-10 flex items-center justify-center text-sm font-medium snap-center cursor-pointer select-none",
                        "transition-[transform,color,opacity] duration-200 ease-[cubic-bezier(0.22,1,0.36,1)]",
                        tempYear === y ? "text-foreground font-bold scale-105 opacity-100" : "text-ink-muted/45 scale-100 opacity-70",
                      )}
                    >
                      {y}
                    </div>
                  ))}
                </div>
              </div>

              <div className="flex gap-2.5 sm:gap-3 pt-0.5">
                <button
                  type="button"
                  onClick={() => {
                    const today = new Date();
                    setTempMonth(today.getMonth());
                    setTempDay(today.getDate());
                    setTempYear(today.getFullYear());
                  }}
                  className="flex-1 min-h-12 h-12 sm:h-11 text-xs sm:text-sm font-semibold rounded-full border border-border/60 hover:bg-surface/50 active:scale-[0.98] text-foreground transition-[transform,background-color,box-shadow] duration-200 ease-out"
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className="flex-[2] min-h-12 h-12 sm:h-11 text-xs sm:text-sm font-semibold rounded-full bg-foreground text-background hover:bg-foreground/90 active:scale-[0.98] transition-[transform,background-color,box-shadow] duration-200 ease-out shadow-md"
                >
                  Set date
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
