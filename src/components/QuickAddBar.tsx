import { useState, useRef, useEffect } from "react";
import { Plus, Sparkles, Loader2, Mic, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { cn, vibrate } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { todayISO, addDays, getCurrencySymbol, formatINR, Expense, CategoryDef } from "@/lib/expenses";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RollingDatePicker } from "./RollingDatePicker";

interface Props {
  onAdd: (e: Omit<Expense, "id" | "created_at">) => void;
  categories: CategoryDef[];
  defaultDate?: string;
}

interface SpeechRecognitionEvent {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: {
      [index: number]: {
        transcript: string;
      };
    };
  };
}

interface SpeechRecognitionErrorEvent {
  error: string;
  message?: string;
}

interface SpeechRecognitionInstance {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: (() => void) | null;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEvent) => void) | null;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  start(): void;
  stop(): void;
}

// Global declaration for standard and webkit SpeechRecognition API
const SpeechRecognitionConstructor = (window as unknown as {
  SpeechRecognition?: new () => SpeechRecognitionInstance;
  webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
}).SpeechRecognition || (window as unknown as {
  webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
}).webkitSpeechRecognition;

const isSpeechSupported = !!SpeechRecognitionConstructor;

export function QuickAddBar({ onAdd, categories, defaultDate }: Props) {
  const [val, setVal] = useState("");
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [parsedPreview, setParsedPreview] = useState<{ amount: number; note: string; date: string; category?: string } | null>(null);

  // Confirmation dialog states
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAmount, setConfirmAmount] = useState("");
  const [confirmNote, setConfirmNote] = useState("");
  const [confirmCategory, setConfirmCategory] = useState("");
  const [confirmDate, setConfirmDate] = useState("");
  const [confirmType, setConfirmType] = useState<"expense" | "income">("expense");

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const speechTranscriptRef = useRef("");

  useEffect(() => {
    return () => {
      if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  const startMediaRecorder = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream);
      audioChunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) audioChunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        const audioBlob = new Blob(audioChunksRef.current, { type: "audio/webm" });
        setIsListening(false);
        setLoading(true);

        const reader = new FileReader();
        reader.readAsDataURL(audioBlob);
        reader.onloadend = async () => {
          const resultStr = reader.result as string;
          const base64data = resultStr.split(",")[1];
          await parseAndOpenConfirmation(null, base64data);
        };

        stream.getTracks().forEach(track => track.stop());
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setIsListening(true);
      vibrate(30);
    } catch (err) {
      console.error("Microphone access failed for MediaRecorder:", err);
      setIsListening(false);
    }
  };

  const stopMediaRecorder = () => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  };

  const handlePressStart = async (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (loading) return;
    if (isListening) return;

    speechTranscriptRef.current = "";

    if (isSpeechSupported) {
      if (!SpeechRecognitionConstructor) return;
      const rec = new SpeechRecognitionConstructor();
      rec.continuous = true;
      rec.interimResults = true;
      rec.lang = "en-US";

      rec.onstart = () => {
        setIsListening(true);
        vibrate(35);
      };

      rec.onend = () => {
        const finalTxt = speechTranscriptRef.current.trim();
        if (finalTxt) {
          parseAndOpenConfirmation(finalTxt);
        }
      };

      rec.onerror = (err) => {
        console.error("Speech recognition error:", err.error);
        setIsListening(false);
      };

      rec.onresult = (ev) => {
        let transcript = "";
        for (let i = ev.resultIndex; i < ev.results.length; i++) {
          transcript += ev.results[i][0].transcript;
        }
        speechTranscriptRef.current = transcript;
        setVal(transcript);
      };

      recognitionRef.current = rec;
      rec.start();
    } else {
      await startMediaRecorder();
    }
  };

  const handlePressEnd = (e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault();
    if (!isListening) return;

    setIsListening(false);
    vibrate(40);

    if (isSpeechSupported) {
      recognitionRef.current?.stop();
    } else {
      stopMediaRecorder();
    }
  };

  const handleTextChange = (text: string) => {
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

        let category = "Other";
        const noteLower = cleanNote.toLowerCase();
        if (noteLower.includes("food") || noteLower.includes("lunch") || noteLower.includes("dinner") || noteLower.includes("cafe") || noteLower.includes("eat") || noteLower.includes("restaurant")) {
          category = "Food";
        } else if (noteLower.includes("uber") || noteLower.includes("ola") || noteLower.includes("taxi") || noteLower.includes("auto") || noteLower.includes("cab") || noteLower.includes("travel")) {
          category = "Transport";
        } else if (noteLower.includes("rent") || noteLower.includes("room") || noteLower.includes("hostel")) {
          category = "Housing";
        } else if (noteLower.includes("wifi") || noteLower.includes("electricity") || noteLower.includes("bill") || noteLower.includes("water") || noteLower.includes("recharge")) {
          category = "Utilities";
        } else if (noteLower.includes("amazon") || noteLower.includes("myntra") || noteLower.includes("shopping") || noteLower.includes("clothes") || noteLower.includes("flipkart")) {
          category = "Shopping";
        }

        const matched = categories.find(c => c.name.toLowerCase() === category.toLowerCase());

        setParsedPreview({
          amount,
          note: cleanNote,
          date,
          category: matched?.name ?? "Other"
        });
        return;
      }
    }
    setParsedPreview(null);
  };

  const parseAndOpenConfirmation = async (textToParse: string | null, base64Audio?: string) => {
    if (!textToParse?.trim() && !base64Audio) return;

    setLoading(true);
    try {
      let parsed: { amount: number; note: string; date: string; category?: string; date_explicit?: boolean; transcribed_text?: string } | null = null;

      // Try local client regex parsing first (only if text is available)
      if (textToParse) {
        const amountMatch = textToParse.match(/^(\d+(?:\.\d+)?)\s+(.+)$/) || textToParse.match(/^(.+?)\s+(\d+(?:\.\d+)?)$/);
        if (amountMatch) {
          let amtStr = "";
          let noteStr = "";
          if (textToParse.match(/^(\d+(?:\.\d+)?)\s+(.+)$/)) {
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
            let date_explicit = false;

            if (cleanNote.toLowerCase().endsWith("yesterday")) {
              date = addDays(todayISO(), -1);
              cleanNote = cleanNote.slice(0, -9).trim();
              date_explicit = true;
            } else if (cleanNote.toLowerCase().endsWith("today")) {
              date = todayISO();
              cleanNote = cleanNote.slice(0, -5).trim();
              date_explicit = true;
            }

            let category = "Other";
            const noteLower = cleanNote.toLowerCase();
            if (noteLower.includes("food") || noteLower.includes("lunch") || noteLower.includes("dinner") || noteLower.includes("cafe") || noteLower.includes("eat") || noteLower.includes("restaurant")) {
              category = "Food";
            } else if (noteLower.includes("uber") || noteLower.includes("ola") || noteLower.includes("taxi") || noteLower.includes("auto") || noteLower.includes("cab") || noteLower.includes("travel")) {
              category = "Transport";
            } else if (noteLower.includes("rent") || noteLower.includes("room") || noteLower.includes("hostel")) {
              category = "Housing";
            } else if (noteLower.includes("wifi") || noteLower.includes("electricity") || noteLower.includes("bill") || noteLower.includes("water") || noteLower.includes("recharge")) {
              category = "Utilities";
            } else if (noteLower.includes("amazon") || noteLower.includes("myntra") || noteLower.includes("shopping") || noteLower.includes("clothes") || noteLower.includes("flipkart")) {
              category = "Shopping";
            }

            const matched = categories.find(c => c.name.toLowerCase() === category.toLowerCase());
            parsed = {
              amount,
              note: cleanNote,
              date,
              category: matched?.name ?? "Other",
              date_explicit
            };
          }
        }
      }

      // Invoke server-side parser Edge Function
      if (!parsed) {
        const payload: { text?: string; audio?: string; mimeType?: string } = {};
        if (base64Audio) {
          payload.audio = base64Audio;
          payload.mimeType = "audio/webm";
        } else if (textToParse) {
          payload.text = textToParse;
        }

        const { data, error } = await supabase.functions.invoke("nl-parse-expense", {
          body: payload
        });
        if (error) throw error;
        if (data) {
          parsed = {
            amount: data.amount,
            note: data.note,
            date: data.date,
            category: data.category_guess,
            date_explicit: data.date_explicit,
            transcribed_text: data.transcribed_text
          };
        }
      }

      if (parsed && parsed.amount > 0) {
        if (parsed.transcribed_text) {
          setVal(parsed.transcribed_text);
        }

        const resolvedDate = parsed.date_explicit ? parsed.date : (defaultDate || todayISO());

        setConfirmAmount(String(parsed.amount));
        setConfirmNote(parsed.note);
        setConfirmDate(resolvedDate);

        const lowerNote = parsed.note.toLowerCase();
        const isIncome = lowerNote.includes("salary") || lowerNote.includes("freelance") || lowerNote.includes("refund") || lowerNote.includes("income") || lowerNote.includes("bonus");
        setConfirmType(isIncome ? "income" : "expense");

        const matched = categories.find(c => c.name.toLowerCase() === parsed.category?.toLowerCase());
        setConfirmCategory(matched?.name ?? categories[0]?.name ?? "Other");

        setConfirmOpen(true);
        vibrate([40, 60]);
      }
    } catch (err) {
      console.error("AI parsing failed:", err);
    } finally {
      setLoading(false);
    }
  };

  const handleAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!val.trim()) return;
    await parseAndOpenConfirmation(val);
  };

  const handleConfirmSave = () => {
    const amountNum = parseFloat(confirmAmount);
    if (isNaN(amountNum) || amountNum <= 0) return;

    onAdd({
      amount: amountNum,
      category: confirmCategory,
      note: confirmNote,
      date: confirmDate,
      payment_method: "upi",
      type: confirmType,
      currency: "INR",
      fx_rate: 1,
      base_amount: amountNum
    });

    setConfirmOpen(false);
    setVal("");
    setParsedPreview(null);
    vibrate([40, 60]);
  };

  return (
    <div className="mb-6 w-full space-y-4">
      {/* Pristine Text Input Bar */}
      <form onSubmit={handleAddSubmit} className="relative">
        <div className="relative flex items-center bg-surface/40 backdrop-blur-md rounded-2xl border border-border/40 focus-within:border-foreground/25 focus-within:bg-surface/60 transition-all p-1.5 pl-4 pr-1.5">
          <Sparkles className="h-4 w-4 text-amber-500 mr-2.5 shrink-0 animate-pulse" />

          <Input
            value={val}
            onChange={(e) => handleTextChange(e.target.value)}
            disabled={loading}
            placeholder="Quick Add: '450 Dinner yesterday'..."
            className="border-0 bg-transparent p-0 h-10 shadow-none focus-visible:ring-0 text-sm placeholder:text-ink-muted/50 text-foreground flex-1 focus-visible:border-0"
          />

          <button
            type="submit"
            disabled={loading || !val.trim()}
            className="h-9 px-4 rounded-xl bg-foreground text-background flex items-center justify-center text-xs font-semibold hover:bg-foreground/90 disabled:opacity-30 disabled:pointer-events-none transition-all active:scale-95 shrink-0 ml-2"
          >
            {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Plus className="h-3.5 w-3.5 mr-1" />}
            Log
          </button>
        </div>

        {parsedPreview && !isListening && (
          <div className="mt-2.5 flex flex-wrap items-center gap-1.5 px-3 animate-in fade-in slide-in-from-top-1 duration-200">
            <span className="text-[9px] uppercase tracking-wider text-ink-muted/50 mr-1 select-none">Live parsing:</span>
            <span className="inline-flex items-center rounded-md bg-foreground/5 border border-border/40 px-2 py-0.5 text-[10px] font-medium font-serif text-foreground tabular-nums">
              {getCurrencySymbol()} {formatINR(parsedPreview.amount)}
            </span>
            <span className="inline-flex items-center rounded-md bg-foreground/5 border border-border/40 px-2 py-0.5 text-[10px] font-medium text-foreground max-w-[120px] truncate">
              "{parsedPreview.note}"
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

      {/* Premium Push-To-Talk Mic Module */}
      <div className="flex flex-col items-center justify-center gap-3 bg-surface/30 backdrop-blur-md border border-border/40 rounded-[28px] p-5 shadow-sm relative overflow-hidden">
        {/* Glowing background ripple during active listening */}
        <div className={cn(
          "absolute -inset-10 bg-[radial-gradient(circle_at_center,var(--tw-gradient-stops))] from-rose-500/0 to-transparent pointer-events-none transition-all duration-700",
          isListening && "from-rose-500/10 scale-125"
        )} />

        <div className="relative flex items-center justify-center">
          {isListening && (
            <>
              <span className="absolute h-24 w-24 rounded-full border border-rose-500/20 animate-ping duration-1000" />
              <span className="absolute h-20 w-20 rounded-full border border-rose-500/35 animate-ping duration-1000 delay-150" />
            </>
          )}

          <button
            type="button"
            onMouseDown={handlePressStart}
            onMouseUp={handlePressEnd}
            onMouseLeave={handlePressEnd}
            onTouchStart={handlePressStart}
            onTouchEnd={handlePressEnd}
            className={cn(
              "h-16 w-16 rounded-full flex items-center justify-center transition-all duration-300 shadow-lg active:scale-90 touch-none cursor-pointer",
              isListening
                ? "bg-rose-500 text-white shadow-rose-500/40 border-0"
                : "bg-surface border border-border/50 text-foreground hover:text-foreground hover:border-foreground/30 hover:bg-wash-clay/30"
            )}
            style={{ touchAction: "none" }}
            title="Hold to speak, release to analyze"
          >
            {loading ? (
              <Loader2 className="h-6 w-6 animate-spin text-purple-500" />
            ) : isListening ? (
              <Mic className="h-6 w-6 animate-pulse" />
            ) : (
              <Mic className="h-6 w-6" />
            )}
          </button>
        </div>

        <div className="text-center z-10 pointer-events-none select-none">
          <p className={cn(
            "text-[10px] tracking-[0.22em] uppercase font-bold transition-colors",
            isListening ? "text-rose-500" : "text-ink-muted/70"
          )}>
            {loading ? "Analyzing Speech..." : isListening ? "Listening... Keep holding" : "Hold & Speak to Maya"}
          </p>
          {!isListening && !loading && (
            <p className="text-[9px] text-ink-muted/40 mt-1">
              "150 Dinner yesterday" or "received salary 50000"
            </p>
          )}
        </div>
      </div>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="max-w-sm rounded-[24px] bg-surface/95 border-border/50 backdrop-blur-xl p-5 shadow-2xl focus:outline-none animate-in zoom-in-95 duration-200">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-foreground font-serif text-lg font-normal">
              <Sparkles className="h-4 w-4 text-amber-500 animate-pulse" /> Review Transaction
            </DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-3">
            <div className="flex bg-wash-clay/30 rounded-full p-1 border border-border/30">
              <button
                type="button"
                onClick={() => setConfirmType("expense")}
                className={cn(
                  "flex-1 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all",
                  confirmType === "expense" ? "bg-background text-foreground shadow-xs" : "text-ink-muted hover:text-foreground"
                )}
              >
                Expense
              </button>
              <button
                type="button"
                onClick={() => setConfirmType("income")}
                className={cn(
                  "flex-1 py-1.5 rounded-full text-[10px] font-bold uppercase tracking-wider transition-all",
                  confirmType === "income" ? "bg-background text-foreground shadow-xs" : "text-ink-muted hover:text-foreground"
                )}
              >
                Income
              </button>
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] tracking-[0.2em] uppercase text-ink-muted font-semibold">Amount ({getCurrencySymbol()})</Label>
              <Input
                type="number"
                inputMode="decimal"
                value={confirmAmount}
                onChange={(e) => setConfirmAmount(e.target.value)}
                className="rounded-full bg-background/50 border-border h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label className="text-[10px] tracking-[0.2em] uppercase text-ink-muted font-semibold">Note / Description</Label>
              <Input
                value={confirmNote}
                onChange={(e) => setConfirmNote(e.target.value)}
                className="rounded-full bg-background/50 border-border h-9"
                placeholder="Transaction details..."
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label className="text-[10px] tracking-[0.2em] uppercase text-ink-muted font-semibold">Category</Label>
                <Select value={confirmCategory} onValueChange={setConfirmCategory}>
                  <SelectTrigger className="rounded-full bg-background/50 border-border h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categories.map((c) => (
                      <SelectItem key={c.name} value={c.name} className="text-xs">
                        {c.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5 font-sans">
                <Label className="text-[10px] tracking-[0.2em] uppercase text-ink-muted font-semibold">Date</Label>
                <RollingDatePicker
                  value={confirmDate}
                  onChange={setConfirmDate}
                  max={todayISO()}
                  className="h-9 text-xs"
                />
              </div>
            </div>
          </div>

          <DialogFooter className="flex gap-2.5 pt-2">
            <Button variant="ghost" onClick={() => setConfirmOpen(false)} className="rounded-full flex-1 h-10 text-xs border border-border/50 text-ink-muted hover:text-foreground">
              Cancel
            </Button>
            <Button onClick={handleConfirmSave} className="rounded-full flex-1 h-10 text-xs bg-foreground text-background hover:bg-foreground/90 font-bold shadow-sm">
              <Check className="h-3.5 w-3.5 mr-1" /> Log Transaction
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
