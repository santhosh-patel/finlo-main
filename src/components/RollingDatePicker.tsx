import React, {
  useState,
  useEffect,
  useRef,
  useMemo,
  useCallback,
  type CSSProperties,
} from "react";
import { createPortal } from "react-dom";
import { cn } from "@/lib/utils";
import { Calendar, ChevronDown, Clock } from "lucide-react";

/* ------------------------------------------------------------------ */
/*  Types                                                              */
/* ------------------------------------------------------------------ */

interface RollingDatePickerProps {
  value: string; // YYYY-MM-DD  or  YYYY-MM-DDTHH:mm
  onChange: (value: string) => void;
  className?: string;
  max?: string;
  placeholder?: string;
  showTime?: boolean;
}

/* ------------------------------------------------------------------ */
/*  Constants                                                          */
/* ------------------------------------------------------------------ */

const MONTHS = [
  "January","February","March","April","May","June",
  "July","August","September","October","November","December",
];

const ITEM_H  = 42;
const VISIBLE = 5;
const WHEEL_H = ITEM_H * VISIBLE;
const PAD     = ITEM_H * Math.floor(VISIBLE / 2);

function getDaysInMonth(m: number, y: number) { return new Date(y, m + 1, 0).getDate(); }
function clamp(v: number, lo: number, hi: number) { return Math.max(lo, Math.min(hi, v)); }
function pad2(n: number) { return String(n).padStart(2, "0"); }

/* ------------------------------------------------------------------ */
/*  Wheel – barrel-roll column with distance-based transforms          */
/* ------------------------------------------------------------------ */

interface WheelItem { label: string; value: number }

interface WheelProps {
  items: WheelItem[];
  selected: number;
  onSelect: (v: number) => void;
  label?: string;
  width?: string;
}

function Wheel({ items, selected, onSelect, label, width }: WheelProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const scrolling    = useRef(false);
  const raf          = useRef(0);
  const settleTimer  = useRef<ReturnType<typeof setTimeout>>();

  /* ---- programmatic scroll ---- */
  const scrollToIdx = useCallback((idx: number, instant = false) => {
    const el = containerRef.current;
    if (!el) return;
    scrolling.current = true;
    el.scrollTo({ top: idx * ITEM_H, behavior: instant ? "instant" : "smooth" });
    clearTimeout(settleTimer.current);
    settleTimer.current = setTimeout(() => { scrolling.current = false; }, instant ? 50 : 320);
  }, []);

  /* ---- sync to selected prop ---- */
  useEffect(() => {
    const idx = items.findIndex((i) => i.value === selected);
    if (idx >= 0) scrollToIdx(idx, true);
  }, [selected, items, scrollToIdx]);

  /* ---- distance-based style for each item ---- */
  const [scrollTop, setScrollTop] = useState(0);

  const handleScroll = useCallback(() => {
    const el = containerRef.current;
    if (!el) return;
    setScrollTop(el.scrollTop);

    if (scrolling.current) return;
    cancelAnimationFrame(raf.current);
    raf.current = requestAnimationFrame(() => {
      clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => {
        if (!containerRef.current) return;
        const idx = clamp(Math.round(containerRef.current.scrollTop / ITEM_H), 0, items.length - 1);
        const v = items[idx].value;
        if (v !== selected) onSelect(v);
        scrollToIdx(idx);
      }, 100);
    });
  }, [items, selected, onSelect, scrollToIdx]);

  useEffect(() => () => { cancelAnimationFrame(raf.current); clearTimeout(settleTimer.current); }, []);

  const itemStyle = useCallback((idx: number): CSSProperties => {
    const center = scrollTop + PAD;
    const itemCenter = idx * ITEM_H + ITEM_H / 2;
    const dist = (itemCenter - center) / ITEM_H; // signed distance in items
    const abs  = Math.min(Math.abs(dist), 2.5);

    const scale   = 1 - abs * 0.08;            // 1.0 → 0.80
    const opacity = 1 - abs * 0.32;            // 1.0 → 0.20
    const rotateX = dist * -18;                // barrel tilt
    const translateY = dist * 1.5;

    return {
      height: ITEM_H,
      transform: `perspective(300px) rotateX(${rotateX}deg) scale(${scale}) translateY(${translateY}px)`,
      opacity: Math.max(opacity, 0.12),
      transition: scrolling.current ? "none" : "transform 120ms ease-out, opacity 120ms ease-out",
      willChange: "transform, opacity",
    };
  }, [scrollTop]);

  return (
    <div className="flex flex-col items-center min-w-0" style={{ width: width || "auto", flex: width ? "none" : 1 }}>
      {label && (
        <span className="text-[9px] uppercase tracking-[0.18em] text-ink-muted/60 font-semibold mb-1 select-none">
          {label}
        </span>
      )}
      <div className="relative w-full overflow-hidden" style={{ height: WHEEL_H }}>
        {/* center highlight */}
        <div
          className="absolute inset-x-0.5 rounded-[10px] bg-foreground/[0.05] pointer-events-none"
          style={{ top: PAD, height: ITEM_H }}
        />
        {/* fade masks */}
        <div className="absolute inset-x-0 top-0 pointer-events-none z-[1]"
          style={{ height: PAD, background: "linear-gradient(to bottom, var(--background) 20%, transparent)" }} />
        <div className="absolute inset-x-0 bottom-0 pointer-events-none z-[1]"
          style={{ height: PAD, background: "linear-gradient(to top, var(--background) 20%, transparent)" }} />

        <div
          ref={containerRef}
          onScroll={handleScroll}
          className="h-full overflow-y-auto scrollbar-none overscroll-contain"
          style={{ scrollSnapType: "y mandatory", WebkitOverflowScrolling: "touch" }}
        >
          <div style={{ height: PAD }} aria-hidden />
          {items.map((item, idx) => {
            const isActive = item.value === selected;
            return (
              <div
                key={item.value}
                role="option"
                aria-selected={isActive}
                onClick={() => { onSelect(item.value); scrollToIdx(items.findIndex(i => i.value === item.value)); }}
                className={cn(
                  "flex items-center justify-center select-none cursor-pointer snap-center",
                  isActive ? "text-foreground font-semibold" : "text-ink-muted font-medium",
                )}
                style={itemStyle(idx)}
              >
                <span className="text-[15px] tabular-nums whitespace-nowrap">{item.label}</span>
              </div>
            );
          })}
          <div style={{ height: PAD }} aria-hidden />
        </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

export function RollingDatePicker({
  value,
  onChange,
  className,
  max,
  placeholder,
  showTime = false,
}: RollingDatePickerProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [closing, setClosing] = useState(false);

  const close = useCallback(() => {
    setClosing(true);
    setTimeout(() => { setIsOpen(false); setClosing(false); }, 220);
  }, []);

  /* ---- parse value ---- */
  const parsed = useMemo(() => {
    const now = new Date();
    const def = { y: now.getFullYear(), m: now.getMonth(), d: now.getDate(), hr: 12, min: 0, ampm: "AM" as const };
    if (!value) return def;
    const dt = value.includes("T") ? new Date(value) : new Date(value + "T00:00:00");
    if (isNaN(dt.getTime())) return def;
    const h24 = dt.getHours();
    return { y: dt.getFullYear(), m: dt.getMonth(), d: dt.getDate(), hr: h24 % 12 || 12, min: dt.getMinutes(), ampm: (h24 >= 12 ? "PM" : "AM") as "AM" | "PM" };
  }, [value]);

  const [tmpY, setY]     = useState(parsed.y);
  const [tmpM, setM]     = useState(parsed.m);
  const [tmpD, setD]     = useState(parsed.d);
  const [tmpHr, setHr]   = useState(parsed.hr);
  const [tmpMn, setMn]   = useState(parsed.min);
  const [tmpAP, setAP]   = useState<"AM"|"PM">(parsed.ampm);
  const [timeOn, setTimeOn] = useState(showTime && value.includes("T"));
  const [rawInput, setRawInput] = useState("");

  /* sync on open */
  useEffect(() => {
    if (!isOpen) return;
    setY(parsed.y); setM(parsed.m); setD(parsed.d);
    setHr(parsed.hr); setMn(parsed.min); setAP(parsed.ampm);
    setTimeOn(showTime && value.includes("T"));
    setRawInput("");
  }, [isOpen, parsed, showTime, value]);

  const daysCount = useMemo(() => getDaysInMonth(tmpM, tmpY), [tmpM, tmpY]);
  useEffect(() => { if (tmpD > daysCount) setD(daysCount); }, [daysCount, tmpD]);

  const maxDate = useMemo(() => {
    if (!max) return null;
    const p = new Date(max + "T23:59:59");
    return isNaN(p.getTime()) ? null : p;
  }, [max]);

  /* keyboard / body lock */
  useEffect(() => {
    if (!isOpen) return;
    const fn = (e: KeyboardEvent) => { if (e.key === "Escape") close(); };
    document.addEventListener("keydown", fn);
    return () => document.removeEventListener("keydown", fn);
  }, [isOpen, close]);

  useEffect(() => {
    if (!isOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [isOpen]);

  /* ---- wheel data ---- */
  const yearItems = useMemo(() => {
    const c = new Date().getFullYear();
    return Array.from({ length: 20 }, (_, i) => ({ label: String(c - 8 + i), value: c - 8 + i }));
  }, []);
  const monthItems = useMemo(() => MONTHS.map((m, i) => ({ label: m.slice(0, 3), value: i })), []);
  const dayItems   = useMemo(() => Array.from({ length: daysCount }, (_, i) => ({ label: String(i + 1), value: i + 1 })), [daysCount]);
  const hourItems  = useMemo(() => Array.from({ length: 12 }, (_, i) => ({ label: pad2(i + 1), value: i + 1 })), []);
  const minItems   = useMemo(() => Array.from({ length: 60 }, (_, i) => ({ label: pad2(i), value: i })), []);
  const apItems    = useMemo(() => [{ label: "AM", value: 0 }, { label: "PM", value: 1 }], []);

  /* ---- confirm ---- */
  const handleConfirm = () => {
    let s = `${tmpY}-${pad2(tmpM + 1)}-${pad2(tmpD)}`;
    if (timeOn) {
      let h24 = tmpHr % 12;
      if (tmpAP === "PM") h24 += 12;
      s += `T${pad2(h24)}:${pad2(tmpMn)}`;
    }
    if (maxDate && new Date(timeOn ? s : s + "T23:59:59") > maxDate) {
      onChange(max!); close(); return;
    }
    onChange(s); close();
  };

  /* ---- direct input ---- */
  const submitRaw = () => {
    const t = rawInput.trim();
    if (!t) return;
    const parts = t.split(/[/\-.]/).map(Number);
    if (parts.length !== 3 || parts.some(isNaN)) return;
    const [a, b, c] = parts;
    let dt: Date;
    if (a > 31) dt = new Date(a, b - 1, c);
    else if (b > 12) dt = new Date(c < 100 ? 2000 + c : c, a - 1, b);
    else dt = new Date(c < 100 ? 2000 + c : c, b - 1, a);
    if (!isNaN(dt.getTime())) { setY(dt.getFullYear()); setM(dt.getMonth()); setD(dt.getDate()); setRawInput(""); }
  };

  /* ---- display strings ---- */
  const triggerLabel = useMemo(() => {
    if (!value) return placeholder || "Select date";
    const dt = value.includes("T") ? new Date(value) : new Date(value + "T00:00:00");
    if (isNaN(dt.getTime())) return placeholder || "Select date";
    let l = dt.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
    if (value.includes("T")) l += " · " + dt.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true });
    return l;
  }, [value, placeholder]);

  const preview = useMemo(() => {
    const day = tmpD;
    const suffix = [,"st","nd","rd"][day % 10 > 3 || ~~(day % 100 / 10) === 1 ? 0 : day % 10] || "th";
    let l = `${MONTHS[tmpM]} ${day}${suffix}, ${tmpY}`;
    if (timeOn) l += `  ·  ${tmpHr}:${pad2(tmpMn)} ${tmpAP}`;
    return l;
  }, [tmpM, tmpD, tmpY, timeOn, tmpHr, tmpMn, tmpAP]);

  /* ---- render ---- */
  return (
    <div className="relative inline-block w-full">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className={cn(
          "rolling-picker-trigger flex items-center justify-between w-full px-4 h-11 rounded-full",
          "border border-border/60 bg-background hover:bg-surface/40 text-foreground text-sm",
          "transition-all duration-200 cursor-pointer active:scale-[0.98]",
          className,
        )}
      >
        <span className="flex items-center gap-2 min-w-0">
          <Calendar className="h-4 w-4 text-ink-muted shrink-0" />
          <span className="truncate">{triggerLabel}</span>
        </span>
        <ChevronDown className={cn("h-4 w-4 text-ink-muted shrink-0 transition-transform duration-300", isOpen && "rotate-180")} />
      </button>

      {/* Portal overlay */}
      {isOpen &&
        createPortal(
          <div
            className={cn(
              "rolling-picker-modal fixed inset-0 flex items-end sm:items-center justify-center",
              closing
                ? "bg-black/0 backdrop-blur-0 transition-all duration-200"
                : "bg-black/35 backdrop-blur-[2px] transition-all duration-300",
            )}
            style={{ zIndex: "var(--finlo-z-date-overlay, 85)" }}
            role="dialog"
            aria-modal="true"
            onClick={close}
          >
            <div
              className={cn(
                "rolling-picker-modal w-full max-w-[390px]",
                "bg-background border border-border/50 rounded-t-[22px] sm:rounded-[22px]",
                "shadow-[0_-16px_64px_-12px_rgba(0,0,0,0.25)] sm:shadow-2xl",
                "flex flex-col gap-0",
                "px-5 pt-3 pb-[max(1.25rem,calc(env(safe-area-inset-bottom,0px)+0.75rem))]",
                "sm:px-6 sm:pt-5 sm:pb-6",
                closing
                  ? "opacity-0 translate-y-6 scale-[0.97] transition-all duration-200 ease-in"
                  : "opacity-100 translate-y-0 scale-100 motion-safe:animate-in motion-safe:fade-in-0 motion-safe:slide-in-from-bottom-6 motion-safe:duration-[350ms] motion-safe:ease-[cubic-bezier(0.16,1,0.3,1)]",
              )}
              onClick={(e) => e.stopPropagation()}
            >
              {/* drag handle */}
              <div className="mx-auto h-[5px] w-10 rounded-full bg-foreground/10 mb-4 sm:hidden" aria-hidden />

              {/* preview */}
              <p className="text-center text-lg sm:text-xl font-medium text-foreground tracking-tight mb-5 select-none leading-snug">
                {preview}
              </p>

              {/* ───── DATE WHEELS ───── */}
              <div className="flex items-stretch rounded-2xl bg-surface/20 overflow-hidden">
                <Wheel items={monthItems} selected={tmpM} onSelect={setM} label="Month" />
                <Wheel items={dayItems}   selected={tmpD} onSelect={setD} label="Day" />
                <Wheel items={yearItems}  selected={tmpY} onSelect={setY} label="Year" />
              </div>

              {/* direct input */}
              <div className="flex items-center gap-2 mt-4">
                <div className="flex-1 relative">
                  <input
                    type="text"
                    inputMode="numeric"
                    value={rawInput}
                    onChange={(e) => setRawInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") submitRaw(); }}
                    placeholder="DD/MM/YYYY"
                    className={cn(
                      "w-full h-10 pl-3 pr-14 rounded-xl",
                      "border border-border/40 bg-surface/20 text-sm text-foreground",
                      "placeholder:text-ink-muted/35",
                      "focus:outline-none focus:ring-1 focus:ring-foreground/15 focus:border-foreground/25",
                      "transition-all duration-200",
                    )}
                  />
                  <button
                    type="button"
                    onClick={submitRaw}
                    className="absolute right-1 top-1 bottom-1 px-3 text-[11px] font-semibold rounded-lg bg-foreground/[0.06] hover:bg-foreground/10 text-foreground/70 transition-colors"
                  >
                    Go
                  </button>
                </div>
              </div>

              {/* ───── TIME (optional) ───── */}
              {showTime && (
                <div className="mt-5">
                  <button
                    type="button"
                    onClick={() => setTimeOn(!timeOn)}
                    className="flex items-center gap-2.5 text-sm select-none group mb-3"
                  >
                    <div className={cn(
                      "relative h-[22px] w-[40px] rounded-full transition-colors duration-300",
                      timeOn ? "bg-foreground" : "bg-border/80",
                    )}>
                      <div className={cn(
                        "absolute top-[3px] left-[3px] h-4 w-4 rounded-full bg-background shadow-sm transition-transform duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                        timeOn && "translate-x-[18px]",
                      )} />
                    </div>
                    <Clock className="h-3.5 w-3.5 text-ink-muted group-hover:text-foreground transition-colors" />
                    <span className="font-medium text-ink-muted group-hover:text-foreground transition-colors">
                      Add time
                    </span>
                  </button>

                  <div
                    className={cn(
                      "grid transition-all duration-300 ease-[cubic-bezier(0.16,1,0.3,1)]",
                      timeOn ? "grid-rows-[1fr] opacity-100" : "grid-rows-[0fr] opacity-0",
                    )}
                  >
                    <div className="overflow-hidden">
                      <div className="flex items-stretch rounded-2xl bg-surface/20 overflow-hidden">
                        <Wheel items={hourItems} selected={tmpHr} onSelect={setHr} label="Hour" />
                        <Wheel items={minItems}  selected={tmpMn} onSelect={setMn} label="Min" />
                        <Wheel items={apItems} selected={tmpAP === "AM" ? 0 : 1} onSelect={(v) => setAP(v === 0 ? "AM" : "PM")} width="72px" />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* ───── ACTIONS ───── */}
              <div className="flex gap-2.5 mt-5 pt-4 border-t border-border/20">
                <button
                  type="button"
                  onClick={() => { const n = new Date(); setY(n.getFullYear()); setM(n.getMonth()); setD(n.getDate()); }}
                  className={cn(
                    "flex-1 h-11 text-[13px] font-semibold rounded-full",
                    "border border-border/40 text-foreground",
                    "hover:bg-surface/50 active:scale-[0.97]",
                    "transition-all duration-200",
                  )}
                >
                  Today
                </button>
                <button
                  type="button"
                  onClick={handleConfirm}
                  className={cn(
                    "flex-[2] h-11 text-[13px] font-semibold rounded-full",
                    "bg-foreground text-background shadow-sm",
                    "hover:opacity-90 active:scale-[0.97]",
                    "transition-all duration-200",
                  )}
                >
                  Done
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
