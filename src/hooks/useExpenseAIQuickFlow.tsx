import {
  useState, useRef, useEffect, useCallback, useMemo,
  type MouseEventHandler, type PointerEventHandler,
} from "react";
import { Sparkles, Loader2, Mic, Check } from "lucide-react";
import { Input } from "@/components/ui/input";
import { vibrate, cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";
import { todayISO, addDays, getCurrencySymbol, Expense, CategoryDef, DEFAULT_CATEGORIES } from "@/lib/expenses";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RollingDatePicker } from "@/components/RollingDatePicker";

const LONG_PRESS_MS = 380;
const FAB_MOVE_CANCEL_PX = 18;

/** Avoid ReferenceError without globalThis/window (tests, unusual runtimes). */
function getSpeechRecognitionCtor(): (new () => SpeechRecognitionInstance) | undefined {
  if (typeof globalThis === "undefined") return undefined;
  const g = globalThis as unknown as {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  };
  return g.SpeechRecognition ?? g.webkitSpeechRecognition;
}

/** Legacy browsers omit hasPointerCapture; calling it throws. */
function capturePointerMaybe(el: HTMLElement, pointerId: number) {
  try {
    if (typeof el.setPointerCapture !== "function") return;
    el.setPointerCapture(pointerId);
  } catch {
    /* noop */
  }
}

function releasePointerMaybe(el: HTMLElement, pointerId: number) {
  try {
    if (typeof el.hasPointerCapture !== "function" || !el.hasPointerCapture(pointerId)) return;
    el.releasePointerCapture(pointerId);
  } catch {
    /* noop */
  }
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

export interface UseExpenseAIQuickFlowOpts {
  categories: CategoryDef[];
  defaultDate?: string;
  onAdd: (e: Omit<Expense, "id" | "created_at">) => void;
  /** Filled server-side transcripts into the Quick Add input when parsing finishes */
  onParsedTranscript?: (text: string) => void;
  /** Opens the manual add expense sheet */
  onTapAddExpense: () => void;
  /** After user confirms saving from review dialog — e.g. reset quick-add UI */
  onAfterExpenseLogged?: () => void;
}

type FabHoldMode = "idle" | "scheduled" | "voice";

export function useExpenseAIQuickFlow({
  categories,
  defaultDate,
  onAdd,
  onParsedTranscript,
  onTapAddExpense,
  onAfterExpenseLogged,
}: UseExpenseAIQuickFlowOpts) {
  const [loading, setLoading] = useState(false);
  const [isListening, setIsListening] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmAmount, setConfirmAmount] = useState("");
  const [confirmNote, setConfirmNote] = useState("");
  const [confirmCategory, setConfirmCategory] = useState(
    () => DEFAULT_CATEGORIES[0]?.name ?? "Food"
  );
  const [confirmDate, setConfirmDate] = useState("");
  const [confirmType, setConfirmType] = useState<"expense" | "income">("expense");

  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const audioChunksRef = useRef<Blob[]>([]);
  const speechTranscriptRef = useRef("");

  const fabModeRef = useRef<FabHoldMode>("idle");
  const fabHoldTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const fabSuppressClickRef = useRef(false);
  const fabOriginRef = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    return () => {
      if (fabHoldTimerRef.current) window.clearTimeout(fabHoldTimerRef.current);
      try {
        recognitionRef.current?.stop();
      } catch {
        /* ignore */
      }
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    };
  }, []);

  useEffect(() => {
    if (!confirmOpen) return;
    const picks = categories.length > 0 ? categories : DEFAULT_CATEGORIES;
    if (!picks.some((c) => c.name === confirmCategory)) {
      setConfirmCategory(picks[0]?.name ?? "Other");
    }
  }, [confirmOpen, categories, confirmCategory]);

  const parseAndOpenConfirmation = useCallback(async (textToParse: string | null, base64Audio?: string) => {
    if (!textToParse?.trim() && !base64Audio) return;

    setLoading(true);
    try {
      let parsed: {
        amount: number;
        note: string;
        date: string;
        category?: string;
        date_explicit?: boolean;
        transcribed_text?: string;
      } | null = null;

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
          onParsedTranscript?.(parsed.transcribed_text);
        }

        const dateFromParser =
          typeof parsed.date === "string" && /^\d{4}-\d{2}-\d{2}/.test(parsed.date)
            ? parsed.date.slice(0, 10)
            : "";
        const resolvedDate =
          parsed.date_explicit && dateFromParser
            ? dateFromParser
            : (defaultDate || todayISO());

        setConfirmAmount(String(parsed.amount));
        setConfirmNote(parsed.note);
        setConfirmDate(resolvedDate);

        const lowerNote = parsed.note.toLowerCase();
        const isIncome = lowerNote.includes("salary") || lowerNote.includes("freelance") || lowerNote.includes("refund") || lowerNote.includes("income") || lowerNote.includes("bonus");
        setConfirmType(isIncome ? "income" : "expense");

        const categoryOptions = categories.length > 0 ? categories : DEFAULT_CATEGORIES;
        const matched = categoryOptions.find(c => c.name.toLowerCase() === parsed.category?.toLowerCase());
        setConfirmCategory(matched?.name ?? categoryOptions[0]?.name ?? "Other");

        setConfirmOpen(true);
        vibrate([40, 60]);
      }
    } catch (err) {
      console.error("AI parsing failed:", err);
    } finally {
      setLoading(false);
    }
  }, [categories, defaultDate, onParsedTranscript]);

  const stopMediaRecorder = useCallback(() => {
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
  }, []);

  const startMediaRecorder = useCallback(async () => {
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
  }, [parseAndOpenConfirmation]);

  const beginVoiceHold = useCallback(async () => {
    if (loading) return;

    speechTranscriptRef.current = "";

    const SpeechCtor = getSpeechRecognitionCtor();
    if (SpeechCtor) {
      const rec = new SpeechCtor();
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
          void parseAndOpenConfirmation(finalTxt);
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
      };

      recognitionRef.current = rec;
      rec.start();
    } else {
      await startMediaRecorder();
    }
  }, [loading, parseAndOpenConfirmation, startMediaRecorder]);

  const endVoiceHold = useCallback((opts?: { suppressNextClick?: boolean }) => {
    vibrate(40);

    if (getSpeechRecognitionCtor()) {
      try {
        recognitionRef.current?.stop();
      } catch {
        /* no-op — may throw if recognition never transitioned to started */
      }
      recognitionRef.current = null;
    } else {
      stopMediaRecorder();
    }

    setIsListening(false);

    if (opts?.suppressNextClick) {
      fabSuppressClickRef.current = true;
      window.setTimeout(() => {
        fabSuppressClickRef.current = false;
      }, 400);
    }
  }, [stopMediaRecorder]);

  const cleanupFabTimers = useCallback(() => {
    if (fabHoldTimerRef.current) {
      window.clearTimeout(fabHoldTimerRef.current);
      fabHoldTimerRef.current = null;
    }
  }, []);

  const fabPointerDown: PointerEventHandler<HTMLButtonElement> = useCallback((e) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;

    fabOriginRef.current = { x: e.clientX, y: e.clientY };
    cleanupFabTimers();
    fabModeRef.current = "scheduled";

    capturePointerMaybe(e.currentTarget, e.pointerId);

    fabHoldTimerRef.current = window.setTimeout(() => {
      fabHoldTimerRef.current = null;
      if (loading) {
        fabModeRef.current = "scheduled";
        return;
      }
      fabModeRef.current = "voice";
      fabSuppressClickRef.current = true;
      void beginVoiceHold();
    }, LONG_PRESS_MS);
  }, [beginVoiceHold, cleanupFabTimers, loading]);

  const cancelFabScheduling = useCallback(() => {
    cleanupFabTimers();
    if (fabModeRef.current === "scheduled") {
      fabModeRef.current = "idle";
    }
    fabOriginRef.current = null;
  }, [cleanupFabTimers]);

  const fabPointerUpLike: PointerEventHandler<HTMLButtonElement> = useCallback((e) => {
    if (fabModeRef.current === "scheduled") {
      cleanupFabTimers();
      fabSuppressClickRef.current = true;
      window.setTimeout(() => {
        fabSuppressClickRef.current = false;
      }, 400);
      onTapAddExpense();
      fabModeRef.current = "idle";
      fabOriginRef.current = null;
      releasePointerMaybe(e.currentTarget, e.pointerId);
      return;
    }

    if (fabModeRef.current === "voice") {
      endVoiceHold({ suppressNextClick: true });
      fabModeRef.current = "idle";
      fabOriginRef.current = null;
      releasePointerMaybe(e.currentTarget, e.pointerId);
      return;
    }

    cleanupFabTimers();
    fabOriginRef.current = null;
    releasePointerMaybe(e.currentTarget, e.pointerId);
  }, [cleanupFabTimers, endVoiceHold, onTapAddExpense]);

  const fabPointerMove: PointerEventHandler<HTMLButtonElement> = useCallback((e) => {
    if (fabModeRef.current !== "scheduled" || !fabOriginRef.current) return;
    const dx = e.clientX - fabOriginRef.current.x;
    const dy = e.clientY - fabOriginRef.current.y;
    if (dx * dx + dy * dy > FAB_MOVE_CANCEL_PX * FAB_MOVE_CANCEL_PX) {
      cancelFabScheduling();
      releasePointerMaybe(e.currentTarget, e.pointerId);
    }
  }, [cancelFabScheduling]);

  const fabPointerCancelLike: PointerEventHandler<HTMLButtonElement> = useCallback((e) => {
    if (fabModeRef.current === "scheduled") {
      cancelFabScheduling();
    } else if (fabModeRef.current === "voice") {
      endVoiceHold({ suppressNextClick: true });
      fabModeRef.current = "idle";
    }
    fabOriginRef.current = null;
    releasePointerMaybe(e.currentTarget, e.pointerId);
  }, [cancelFabScheduling, endVoiceHold]);

  const fabPointerLeave: PointerEventHandler<HTMLButtonElement> = useCallback((e) => {
    if (fabModeRef.current !== "scheduled") return;
    cancelFabScheduling();
    releasePointerMaybe(e.currentTarget, e.pointerId);
  }, [cancelFabScheduling]);

  const fabLostPointerCapture: PointerEventHandler<HTMLButtonElement> = useCallback(() => {
    if (fabModeRef.current === "voice") {
      endVoiceHold({ suppressNextClick: true });
      fabModeRef.current = "idle";
      fabOriginRef.current = null;
      return;
    }
    cancelFabScheduling();
    fabOriginRef.current = null;
  }, [cancelFabScheduling, endVoiceHold]);

  /** Fallback for AssistiveTech / flaky pointer sequences */
  const fabClick: MouseEventHandler<HTMLButtonElement> = useCallback((e) => {
    if (fabSuppressClickRef.current) {
      e.preventDefault();
      e.stopPropagation();
      fabSuppressClickRef.current = false;
      return;
    }
    onTapAddExpense();
  }, [onTapAddExpense]);

  const handleConfirmSave = useCallback(() => {
    const amountNum = parseFloat(confirmAmount);
    if (isNaN(amountNum) || amountNum <= 0) return;

    const categoryChoices = categories.length > 0 ? categories : DEFAULT_CATEGORIES;
    const categoryToSave =
      categoryChoices.some((c) => c.name === confirmCategory)
        ? confirmCategory
        : (categoryChoices[0]?.name ?? "Other");

    const dateTrimmed = confirmDate.trim();
    const dateToSave = /^\d{4}-\d{2}-\d{2}$/.test(dateTrimmed) ? dateTrimmed : todayISO();

    onAdd({
      amount: amountNum,
      category: categoryToSave,
      note: confirmNote,
      date: dateToSave,
      payment_method: "upi",
      type: confirmType,
      currency: "INR",
      fx_rate: 1,
      base_amount: amountNum
    });

    setConfirmOpen(false);
    vibrate([40, 60]);
    onAfterExpenseLogged?.();
  }, [categories, confirmAmount, confirmCategory, confirmDate, confirmNote, confirmType, onAdd, onAfterExpenseLogged]);

  const parseQuickAddText = useCallback(async (text: string) => {
    await parseAndOpenConfirmation(text);
  }, [parseAndOpenConfirmation]);

  const categoryChoicesFallback = categories.length > 0 ? categories : DEFAULT_CATEGORIES;
  const selectCategoryValue = categoryChoicesFallback.some((c) => c.name === confirmCategory)
    ? confirmCategory
    : (categoryChoicesFallback[0]?.name ?? "Other");

  const reviewDialog = useMemo(
    () => (
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
                <Select value={selectCategoryValue} onValueChange={setConfirmCategory}>
                  <SelectTrigger className="rounded-full bg-background/50 border-border h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {categoryChoicesFallback.map((c) => (
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
    ),
    [categories, confirmAmount, confirmCategory, confirmDate, confirmNote, confirmOpen, confirmType, handleConfirmSave, selectCategoryValue]
  );

  const voiceHud = (isListening || loading) ? (
    <div
      className="fixed left-1/2 -translate-x-1/2 z-[45] pointer-events-none px-5 md:hidden transition-all duration-200"
      style={{ bottom: "calc(env(safe-area-inset-bottom, 0px) + 118px)" }}
      aria-live="polite"
    >
      <div
        className={cn(
          "flex items-center gap-3 rounded-full border shadow-lg px-5 py-2.5 backdrop-blur-xl",
          isListening
            ? "bg-rose-500/95 text-white border-rose-400/40"
            : "bg-surface/95 text-foreground border-border/40"
        )}
      >
        {loading ? (
          <Loader2 className="h-5 w-5 animate-spin shrink-0 opacity-90" />
        ) : (
          <Mic className={cn("h-5 w-5 shrink-0", isListening && "animate-pulse")} />
        )}
        <div className="flex flex-col min-w-0 text-left">
          <span className="text-[11px] font-semibold uppercase tracking-[0.12em]">
            {loading ? "Parsing…" : "Listening"}
          </span>
          <span className="text-[9px] opacity-85 leading-tight max-w-[200px]">
            {loading ? "Hang tight" : "Release the + button when done"}
          </span>
        </div>
      </div>
    </div>
  ) : null;

  const fabPointerProps = {
    onPointerDown: fabPointerDown,
    onPointerUp: fabPointerUpLike,
    onPointerCancel: fabPointerCancelLike,
    onPointerLeave: fabPointerLeave,
    onPointerMove: fabPointerMove,
    onLostPointerCapture: fabLostPointerCapture,
    onClick: fabClick,
  };

  return {
    loading,
    isListening,
    parseQuickAddText,
    reviewDialog,
    voiceHud,
    fabPointerProps,
  };
}
