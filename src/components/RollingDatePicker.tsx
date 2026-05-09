import React, { useState, useEffect, useRef, useMemo } from "react";
import { cn } from "@/lib/utils";
import { Calendar, ChevronDown } from "lucide-react";

interface RollingDatePickerProps {
  value: string; // YYYY-MM-DD
  onChange: (value: string) => void;
  className?: string;
  max?: string; // YYYY-MM-DD
  placeholder?: string;
}

const MONTHS = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December"
];

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
          "rolling-picker-trigger flex items-center justify-between w-full px-4 h-10 rounded-full border border-border/60 bg-background hover:bg-surface/50 text-foreground text-sm transition-colors cursor-pointer",
          className
        )}
      >
        <span className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-ink-muted shrink-0" />
          <span className="truncate">{displayLabel}</span>
        </span>
        <ChevronDown className="h-4 w-4 text-ink-muted shrink-0" />
      </button>

      {/* iOS Style Rolling Date Picker Overlay */}
      {isOpen && (
        <div className="rolling-picker-modal fixed inset-0 z-50 flex items-end sm:items-center justify-center p-4 bg-black/40 backdrop-blur-[2px] animate-fade-in">
          <div className="w-full max-w-sm bg-background border border-border/80 rounded-t-[32px] sm:rounded-[32px] shadow-2xl p-6 pb-8 sm:pb-6 flex flex-col gap-6 animate-slide-up">
            
            {/* Header */}
            <div className="flex items-center justify-between border-b border-border/30 pb-3">
              <span className="text-sm font-semibold tracking-wide text-foreground uppercase">Select Date</span>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="text-xs font-semibold text-ink-muted hover:text-foreground transition-colors"
              >
                Cancel
              </button>
            </div>

            {/* Rolling Wheel Interface */}
            <div className="relative h-[180px] bg-surface/30 rounded-2xl border border-border/40 overflow-hidden flex">
              
              {/* Highlight window indicator (iOS style center selection slot) */}
              <div className="absolute inset-x-0 top-[70px] h-10 border-y border-foreground/15 bg-foreground/5 pointer-events-none" />

              {/* Cylindrical gradient fade shadows */}
              <div className="absolute inset-0 pointer-events-none bg-gradient-to-b from-background via-transparent to-background" style={{ backgroundSize: "100% 180px" }} />

              {/* Month Wheel */}
              <div
                ref={monthRef}
                onScroll={() => handleScroll(monthRef, "month", MONTHS_SHORT.length)}
                className="flex-1 overflow-y-auto snap-y snap-mandatory scrollbar-none scroll-smooth py-[70px]"
                style={{ height: "180px" }}
              >
                {MONTHS_SHORT.map((m, idx) => (
                  <div
                    key={m}
                    onClick={() => { setTempMonth(idx); scrollTo(monthRef, idx); }}
                    className={cn(
                      "h-10 flex items-center justify-center text-sm font-medium transition-all duration-150 snap-center cursor-pointer select-none",
                      tempMonth === idx ? "text-foreground font-bold scale-110" : "text-ink-muted/50"
                    )}
                  >
                    {m}
                  </div>
                ))}
              </div>

              {/* Day Wheel */}
              <div
                ref={dayRef}
                onScroll={() => handleScroll(dayRef, "day", days.length)}
                className="flex-1 overflow-y-auto snap-y snap-mandatory scrollbar-none scroll-smooth py-[70px]"
                style={{ height: "180px" }}
              >
                {days.map((d, idx) => (
                  <div
                    key={d}
                    onClick={() => { setTempDay(d); scrollTo(dayRef, idx); }}
                    className={cn(
                      "h-10 flex items-center justify-center text-sm font-medium transition-all duration-150 snap-center cursor-pointer select-none",
                      tempDay === d ? "text-foreground font-bold scale-110" : "text-ink-muted/50"
                    )}
                  >
                    {d}
                  </div>
                ))}
              </div>

              {/* Year Wheel */}
              <div
                ref={yearRef}
                onScroll={() => handleScroll(yearRef, "year", years.length)}
                className="flex-1 overflow-y-auto snap-y snap-mandatory scrollbar-none scroll-smooth py-[70px]"
                style={{ height: "180px" }}
              >
                {years.map((y, idx) => (
                  <div
                    key={y}
                    onClick={() => { setTempYear(y); scrollTo(yearRef, idx); }}
                    className={cn(
                      "h-10 flex items-center justify-center text-sm font-medium transition-all duration-150 snap-center cursor-pointer select-none",
                      tempYear === y ? "text-foreground font-bold scale-110" : "text-ink-muted/50"
                    )}
                  >
                    {y}
                  </div>
                ))}
              </div>

            </div>

            {/* Bottom Actions */}
            <div className="flex gap-3">
              <button
                type="button"
                onClick={() => {
                  const today = new Date();
                  setTempMonth(today.getMonth());
                  setTempDay(today.getDate());
                  setTempYear(today.getFullYear());
                }}
                className="flex-1 h-11 text-xs font-semibold rounded-full border border-border/60 hover:bg-surface/50 text-foreground transition-colors"
              >
                Today
              </button>
              <button
                type="button"
                onClick={handleConfirm}
                className="flex-[2] h-11 text-xs font-semibold rounded-full bg-foreground text-background hover:bg-foreground/90 transition-colors"
              >
                Set Date
              </button>
            </div>

          </div>
        </div>
      )}
    </div>
  );
}
