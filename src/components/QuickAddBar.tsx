import { useState, useEffect, useCallback, useRef } from "react";
import { Plus, Sparkles, Loader2, Camera } from "lucide-react";
import { Input } from "@/components/ui/input";
import { vibrate } from "@/lib/utils";
import { todayISO, addDays, getCurrencySymbol, formatINR, CategoryDef } from "@/lib/expenses";
import { supabase } from "@/integrations/supabase/client";
import type { ReceiptScanPrefill } from "@/components/AddExpenseSheet";

interface ExpenseAIFlowLite {
  loading: boolean;
  isListening: boolean;
  parseQuickAddText: (text: string) => Promise<void>;
}

interface Props {
  categories: CategoryDef[];
  defaultDate?: string;
  ai: ExpenseAIFlowLite;
  /** Receives setState so server transcripts can mirror into the quick-add field */
  registerTranscriptSink?: (setText: (text: string) => void) => void;
  /** Set from PWA share target (SMS, notes); fills the natural-language field */
  sharePrefill?: string;
  /** Receipt photo → AI parse → parent opens add sheet with fields filled */
  onReceiptScan?: (prefill: ReceiptScanPrefill) => void;
}

export function QuickAddBar({ categories, defaultDate, ai, registerTranscriptSink, sharePrefill, onReceiptScan }: Props) {
  const [val, setVal] = useState("");
  const [parsedPreview, setParsedPreview] = useState<{ amount: number; note: string; date: string; category?: string } | null>(null);
  const [scanBusy, setScanBusy] = useState(false);
  const receiptInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    registerTranscriptSink?.((text) => setVal(text));
    return () => registerTranscriptSink?.(() => {});
  }, [registerTranscriptSink]);

  const handleTextChange = useCallback((text: string) => {
    setVal(text);
    if (!text.trim()) {
      setParsedPreview(null);
      return;
    }

    const amountMatch = text.match(/^(\d+(?:\.\d+)?)\s+(.+)$/) || text.match(/^(.+?)\s+(\d+(?:\.\d+)?)$/);
    if (amountMatch) {
      let amtStr = "";
      let noteStr = "";
      if (text.match(/^(\d+(?:\.\d+)?)\s+(.+)$/)) {
        amtStr = amountMatch[1];
        noteStr = amountMatch[2];
      } else {
        noteStr = amountMatch[1];
        amtStr = amountMatch[2];
      }
      const amount = parseFloat(amtStr);
      if (amount > 0) {
        let date = defaultDate || todayISO();
        let cleanNote = noteStr.trim();
        if (cleanNote.toLowerCase().endsWith("yesterday")) {
          date = addDays(todayISO(), -1);
          cleanNote = cleanNote.slice(0, -9).trim();
        } else if (cleanNote.toLowerCase().endsWith("today")) {
          date = todayISO();
          cleanNote = cleanNote.slice(0, -5).trim();
        }

        let category = "Misc";
        const noteLower = cleanNote.toLowerCase();
        if (noteLower.includes("food") || noteLower.includes("lunch") || noteLower.includes("dinner") || noteLower.includes("cafe") || noteLower.includes("eat") || noteLower.includes("restaurant")) {
          category = "Food";
        } else if (noteLower.includes("grocery") || noteLower.includes("bigbasket") || noteLower.includes("blinkit") || noteLower.includes("zepto")) {
          category = "Groceries";
        } else if (noteLower.includes("uber") || noteLower.includes("ola") || noteLower.includes("taxi") || noteLower.includes("auto") || noteLower.includes("cab") || noteLower.includes("travel")) {
          category = "Travel";
        } else if (noteLower.includes("rent") || noteLower.includes("room") || noteLower.includes("hostel")) {
          category = "Rent";
        } else if (noteLower.includes("wifi") || noteLower.includes("electricity") || noteLower.includes("bill") || noteLower.includes("water") || noteLower.includes("recharge")) {
          category = "Bills";
        } else if (noteLower.includes("amazon") || noteLower.includes("myntra") || noteLower.includes("shopping") || noteLower.includes("clothes") || noteLower.includes("flipkart")) {
          category = "Shopping";
        }

        const matched = categories.find(c => c.name.toLowerCase() === category.toLowerCase());

        setParsedPreview({
          amount,
          note: cleanNote,
          date,
          category: matched?.name ?? "Misc"
        });
        return;
      }
    }
    setParsedPreview(null);
  }, [categories, defaultDate]);

  useEffect(() => {
    if (!sharePrefill?.trim()) return;
    handleTextChange(sharePrefill);
  }, [sharePrefill, handleTextChange]);

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!val.trim()) return;
    await ai.parseQuickAddText(val);
  };

  const handleReceiptChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file || !onReceiptScan) return;
    setScanBusy(true);
    vibrate(30);
    try {
      const base64String = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          const s = reader.result as string;
          const b64 = s.split(",")[1];
          if (!b64) reject(new Error("no data"));
          else resolve(b64);
        };
        reader.onerror = () => reject(reader.error);
        reader.readAsDataURL(file);
      });
      const ref = defaultDate || todayISO();
      const expenseCategories = categories.filter((c) => c.type !== "income").map((c) => c.name);
      const { data, error } = await supabase.functions.invoke("parse-receipt", {
        body: {
          imageBase64: base64String,
          contentType: file.type || "image/jpeg",
          referenceDate: ref,
          expenseCategories,
        },
      });
      if (error) throw error;
      if (data && typeof data.amount === "number") {
        onReceiptScan({
          amount: data.amount,
          merchant: typeof data.merchant === "string" ? data.merchant : undefined,
          date: typeof data.date === "string" ? data.date : undefined,
          categoryGuess: typeof data.category_guess === "string" ? data.category_guess : undefined,
        });
        vibrate([38, 52, 38]);
      }
    } catch {
      /* minimal UX — errors surface when add sheet opens empty */
    } finally {
      setScanBusy(false);
    }
  };

  return (
    <div className="mb-7 w-full space-y-3">
      <input
        ref={receiptInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-hidden
        onChange={handleReceiptChange}
      />
      <form onSubmit={handleAddSubmit} className="relative">
        <div className="relative flex items-center bg-card rounded-2xl border border-border/60 focus-within:border-foreground/25 transition-all p-1.5 pl-4 pr-1.5 shadow-sm">
          {onReceiptScan && (
            <button
              type="button"
              disabled={scanBusy || ai.loading}
              onClick={() => receiptInputRef.current?.click()}
              className="mr-1.5 shrink-0 h-9 w-9 rounded-xl border border-border/50 flex items-center justify-center text-ink-muted hover:text-foreground hover:bg-surface/80 transition-colors disabled:opacity-40"
              aria-label="Scan receipt"
              title="Scan receipt"
            >
              {scanBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Camera className="h-4 w-4" />}
            </button>
          )}
          <Sparkles className="h-4 w-4 text-amber-500 mr-2.5 shrink-0" />

          <Input
            value={val}
            onChange={(e) => handleTextChange(e.target.value)}
            disabled={ai.loading}
            placeholder="Try '450 dinner yesterday' or scan a receipt"
            className="border-0 bg-transparent p-0 h-10 shadow-none focus-visible:ring-0 text-sm placeholder:text-ink-muted/50 text-foreground flex-1 focus-visible:border-0"
          />

          <button
            type="submit"
            disabled={ai.loading || !val.trim()}
            className="h-9 px-4 rounded-xl bg-foreground text-background flex items-center justify-center text-xs font-semibold hover:bg-foreground/90 disabled:opacity-30 disabled:pointer-events-none transition-all active:scale-95 shrink-0 ml-2"
          >
            {ai.loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
            Log
          </button>
        </div>

        {parsedPreview && !ai.isListening && (
          <div className="mt-2 flex flex-wrap items-center gap-1.5 px-1 animate-in fade-in slide-in-from-top-1 duration-200">
            <span className="text-[9px] uppercase tracking-wider text-ink-muted/50 mr-1 select-none">Preview:</span>
            <span className="inline-flex items-center rounded-md bg-foreground/5 border border-border/40 px-2 py-0.5 text-[10px] font-medium font-serif text-foreground tabular-nums">
              {getCurrencySymbol()} {formatINR(parsedPreview.amount)}
            </span>
            <span className="inline-flex items-center rounded-md bg-foreground/5 border border-border/40 px-2 py-0.5 text-[10px] font-medium text-foreground max-w-[120px] truncate">
              &quot;{parsedPreview.note}&quot;
            </span>
            <span className="inline-flex items-center rounded-md bg-foreground/5 border border-border/40 px-2 py-0.5 text-[10px] font-medium text-foreground">
              {parsedPreview.date}
            </span>
            <span className="inline-flex items-center rounded-md bg-amber-500/10 border border-amber-500/20 px-2 py-0.5 text-[10px] font-semibold text-amber-600 dark:text-amber-400">
              {parsedPreview.category}
            </span>
          </div>
        )}
      </form>
    </div>
  );
}
