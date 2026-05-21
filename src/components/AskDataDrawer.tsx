import { useState, useRef, useEffect, useCallback } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { 
  Send, 
  Loader2, 
  BarChart4, 
  Plus, 
  Trash2, 
  Edit3, 
  Check, 
  X, 
  Menu, 
  MessageSquare,
  ListPlus
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { cn, vibrate } from "@/lib/utils";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip } from "recharts";
import { getCurrencySymbol, formatINR, Expense, CategoryDef, ExpensePayload } from "@/lib/expenses";
import { Button } from "@/components/ui/button";
import { toast } from "@/hooks/use-toast";
import {
  coerceAssistantActionsFromApi,
  validateAgainstKnownCategories,
  type MayaAssistantActions,
} from "@/lib/mayaAssistantActions";
import type { Json } from "@/integrations/supabase/types";

function localTodayISO() {
  const d = new Date();
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

interface ChatSession {
  id: string;
  user_id: string;
  title: string;
  created_at: string;
}

interface DBMessage {
  id: string;
  session_id: string;
  sender: string;
  text: string;
  chart_data: Array<{ label: string; value: number }> | null;
  assistant_actions: MayaAssistantActions | Record<string, unknown> | null;
  created_at: string;
}

interface Message {
  id: string;
  sender: "user" | "bot";
  text: string;
  chartData?: Array<{ label: string; value: number }>;
  assistantActions?: MayaAssistantActions | null;
}

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  transactions: Expense[];
  categories: CategoryDef[];
  addExpense: (e: ExpensePayload) => Expense;
  addCategory: (
    name: string,
    opts?: { subcategories?: string[]; type?: CategoryDef["type"]; silentToast?: boolean }
  ) => void;
}

const SUGGESTED_QUERIES = [
  "Summarize my spending",
  "What is my largest expense?",
  "How much spent on Food?",
  "Compare categories share",
  "Log a ₹500 Coffee expense today",
];

const MAYA_INTRO =
  "Ask about your money or describe a purchase to log it. Use \"Add to Finlo\" when Maya suggests entries.";

const MAYA_TITLE = "Maya";

/** Inline **bold** segments for AI replies */
function MayaBotText({ text }: { text: string }) {
  const paragraphs = text.split(/\n\n+/).filter(Boolean);

  const renderInline = (chunk: string) => {
    const parts = chunk.split(/(\*\*[^*]+\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith("**") && part.endsWith("**")) {
        return (
          <strong key={i} className="font-semibold text-foreground">
            {part.slice(2, -2)}
          </strong>
        );
      }
      return <span key={i}>{part}</span>;
    });
  };

  return (
    <div className="space-y-4 max-w-prose">
      {paragraphs.map((para, i) => {
        const lines = para.split("\n");
        const isList = lines.every((l) => /^[\s]*[-•*]\s/.test(l) || l.trim() === "");

        if (isList && lines.some((l) => /^[\s]*[-•*]\s/.test(l))) {
          return (
            <ul key={i} className="space-y-2 pl-0 list-none">
              {lines
                .filter((l) => /^[\s]*[-•*]\s/.test(l))
                .map((line, j) => (
                  <li key={j} className="flex gap-2.5 text-[15px] leading-[1.65] text-foreground">
                    <span className="text-ink-muted/40 shrink-0 select-none" aria-hidden>
                      ·
                    </span>
                    <span>{renderInline(line.replace(/^[\s]*[-•*]\s+/, ""))}</span>
                  </li>
                ))}
            </ul>
          );
        }

        return (
          <p key={i} className="text-[15px] leading-[1.65] text-foreground font-normal">
            {lines.map((line, j) => (
              <span key={j}>
                {j > 0 && <br />}
                {renderInline(line)}
              </span>
            ))}
          </p>
        );
      })}
    </div>
  );
}

function mayaSessionStorageKey(userId: string) {
  return `maya_active_session_${userId}`;
}

export function AskDataDrawer({
  open,
  onOpenChange,
  transactions,
  categories,
  addExpense,
  addCategory,
}: Props) {
  const { user, profile } = useAuth();
  const [sessions, setSessions] = useState<ChatSession[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionsLoading, setSessionsLoading] = useState(false);
  const [messagesLoading, setMessagesLoading] = useState(false);
  const [applyingActionsForId, setApplyingActionsForId] = useState<string | null>(null);
  
  // Mobile sidebar drawer trigger
  const [sidebarOpen, setSidebarOpen] = useState(false);
  
  // Dynamic visual viewport height to prevent mobile keyboard layout breaking/off-screening
  const [visualHeight, setVisualHeight] = useState<number | null>(null);

  useEffect(() => {
    if (!open || typeof window === "undefined" || !window.visualViewport) return;

    const vv = window.visualViewport;
    const handleResize = () => {
      setVisualHeight(vv.height);
    };

    vv.addEventListener("resize", handleResize);
    vv.addEventListener("scroll", handleResize);
    handleResize();

    return () => {
      vv.removeEventListener("resize", handleResize);
      vv.removeEventListener("scroll", handleResize);
    };
  }, [open]);

  // Inline rename state
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");

  const scrollRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Scroll to bottom helper
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading, messagesLoading]);

  // 1. Fetch conversations/sessions list (also runs on app load so history is ready when drawer opens)
  const loadSessions = useCallback(async () => {
    if (!user?.id) return;
    setSessionsLoading(true);
    try {
      const { data, error } = await supabase
        .from("ai_chat_sessions")
        .select("*")
        .eq("user_id", user.id)
        .order("created_at", { ascending: false });
        
      if (error) throw error;
      
      const sessionList = (data || []) as unknown as ChatSession[];
      setSessions(sessionList);

      const storedId = localStorage.getItem(mayaSessionStorageKey(user.id));
      const restoredId =
        storedId && sessionList.some((s) => s.id === storedId)
          ? storedId
          : sessionList[0]?.id ?? null;

      setActiveSessionId((current) => {
        if (current && sessionList.some((s) => s.id === current)) return current;
        return restoredId;
      });
    } catch (e) {
      console.error("Failed to load chat sessions:", e);
    } finally {
      setSessionsLoading(false);
    }
  }, [user?.id]);

  useEffect(() => {
    if (user?.id) {
      void loadSessions();
    } else {
      setSessions([]);
      setActiveSessionId(null);
      setMessages([]);
    }
  }, [user?.id, loadSessions]);

  useEffect(() => {
    if (user?.id && activeSessionId) {
      localStorage.setItem(mayaSessionStorageKey(user.id), activeSessionId);
    }
  }, [user?.id, activeSessionId]);

  // 2. Fetch messages for active session
  const loadMessages = useCallback(async (sessionId: string) => {
    setMessagesLoading(true);
    try {
      const { data, error } = await supabase
        .from("ai_chat_messages")
        .select("*")
        .eq("session_id", sessionId)
        .order("created_at", { ascending: true });
        
      if (error) throw error;
      
      if (data && data.length > 0) {
        const mapped: Message[] = (data as unknown as DBMessage[]).map((m) => {
          const known = new Set(categories.map((c) => c.name.toLowerCase()));
          let assistantActions =
            coerceAssistantActionsFromApi(m.assistant_actions) ?? null;
          if (assistantActions) {
            assistantActions = validateAgainstKnownCategories(assistantActions, known);
            if (
              assistantActions.categoriesToAdd.length === 0 &&
              assistantActions.transactionsToAdd.length === 0
            ) {
              assistantActions = null;
            }
          }
          return {
            id: m.id,
            sender: m.sender as "user" | "bot",
            text: m.text,
            chartData: m.chart_data ? m.chart_data : undefined,
            assistantActions,
          };
        });
        setMessages(mapped);
      } else {
        setMessages([]);
      }
    } catch (e) {
      console.error("Failed to load chat messages:", e);
    } finally {
      setMessagesLoading(false);
    }
  }, [categories]);

  useEffect(() => {
    if (activeSessionId) {
      loadMessages(activeSessionId);
    } else {
      setMessages([]);
    }
  }, [activeSessionId, loadMessages]);

  // 3. Create brand-new chat session
  const handleNewChat = async () => {
    if (!user?.id) return;
    vibrate();
    try {
      const { data, error } = await supabase
        .from("ai_chat_sessions")
        .insert({
          user_id: user.id,
          title: MAYA_TITLE,
        })
        .select()
        .single();
        
      if (error) throw error;
      if (data) {
        const newSession = data as unknown as ChatSession;
        setSessions((prev) => [newSession, ...prev]);
        setActiveSessionId(newSession.id);
        setSidebarOpen(false);
      }
    } catch (e) {
      console.error("Failed to create new session:", e);
    }
  };

  // 4. Rename/Edit title trigger
  const handleRenameSession = async (sessionId: string) => {
    if (!renameValue.trim()) return;
    try {
      const { error } = await supabase
        .from("ai_chat_sessions")
        .update({ title: renameValue })
        .eq("id", sessionId);
        
      if (error) throw error;
      
      setSessions((prev) => 
        prev.map((s) => (s.id === sessionId ? { ...s, title: renameValue } : s))
      );
      setRenamingId(null);
      vibrate();
    } catch (e) {
      console.error("Failed to rename session:", e);
    }
  };

  // 5. Delete session
  const handleDeleteSession = async (sessionId: string, e: React.MouseEvent) => {
    e.stopPropagation(); // Avoid selecting it as active session
    if (!confirm("Are you sure you want to delete this chat thread?")) return;
    vibrate([60]);
    try {
      const { error } = await supabase
        .from("ai_chat_sessions")
        .delete()
        .eq("id", sessionId);
        
      if (error) throw error;
      
      setSessions((prev) => prev.filter((s) => s.id !== sessionId));
      
      if (activeSessionId === sessionId) {
        const remaining = sessions.filter((s) => s.id !== sessionId);
        if (remaining.length > 0) {
          setActiveSessionId(remaining[0].id);
        } else {
          setActiveSessionId(null);
          setMessages([]);
          if (user?.id) localStorage.removeItem(mayaSessionStorageKey(user.id));
        }
      }
    } catch (e) {
      console.error("Failed to delete session:", e);
    }
  };

  const BOT_MESSAGE_UUID =
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

  const applyMayaSuggestions = useCallback(
    async (m: Message) => {
      if (!m.assistantActions || !user?.id) return;
      setApplyingActionsForId(m.id);
      try {
        const { categoriesToAdd, transactionsToAdd } = m.assistantActions;
        for (const c of categoriesToAdd) {
          addCategory(c.name, {
            subcategories: c.subcategories,
            type: c.type,
            silentToast: true,
          });
        }
        for (const t of transactionsToAdd) {
          addExpense({
            amount: t.amount,
            category: t.category,
            subcategory: t.subcategory ?? undefined,
            note: t.note ?? undefined,
            date: t.date,
            payment_method: t.payment_method,
            type: t.txnType,
          });
        }
        if (BOT_MESSAGE_UUID.test(m.id)) {
          const { error } = await supabase
            .from("ai_chat_messages")
            .update({ assistant_actions: null })
            .eq("id", m.id);
          if (error) console.error("Clear assistant_actions failed:", error);
        }
        setMessages((prev) =>
          prev.map((x) => (x.id === m.id ? { ...x, assistantActions: null } : x)),
        );
        const descParts: string[] = [];
        if (categoriesToAdd.length)
          descParts.push(`${categoriesToAdd.length} categor${categoriesToAdd.length === 1 ? "y" : "ies"}`);
        if (transactionsToAdd.length)
          descParts.push(`${transactionsToAdd.length} transaction${transactionsToAdd.length === 1 ? "" : "s"}`);
        toast({
          title: "Saved to Finlo",
          description: descParts.length ? `Added ${descParts.join(" and ")}.` : "Updates applied.",
        });
        vibrate([40, 60, 40]);
      } catch (e) {
        console.error(e);
        toast({
          title: "Could not save",
          description: e instanceof Error ? e.message : "Try again in a moment.",
          variant: "destructive",
        });
      } finally {
        setApplyingActionsForId(null);
      }
    },
    [addCategory, addExpense, user?.id],
  );

  // 6. Send User / Bot completion request
  const handleSend = async (textToSend: string) => {
    if (!textToSend.trim() || loading || !user?.id) return;

    if (textToSend.trim().length > 1000) {
      toast({
        title: "Message Too Long 🛑",
        description: "To keep our conversation lightning-fast and focused, please limit your message to under 1,000 characters (about 250 tokens). Let's trim it down slightly!",
        variant: "destructive",
      });
      return;
    }

    let targetSessionId = activeSessionId;
    vibrate();

    // Securely auto-create session first if none is active
    if (!targetSessionId) {
      try {
        const { data, error } = await supabase
          .from("ai_chat_sessions")
          .insert({
            user_id: user.id,
            title: MAYA_TITLE,
          })
          .select()
          .single();
          
        if (error) throw error;
        if (data) {
          const s = data as unknown as ChatSession;
          setSessions((prev) => [s, ...prev]);
          targetSessionId = s.id;
          setActiveSessionId(s.id);
        }
      } catch (e) {
        console.error("Auto-create session failure:", e);
        return;
      }
    }

    if (!targetSessionId) return;

    const userMessage: Message = {
      id: Math.random().toString(),
      sender: "user",
      text: textToSend,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      // 1. Write user query message into DB
      await supabase
        .from("ai_chat_messages")
        .insert({
          session_id: targetSessionId,
          sender: "user",
          text: textToSend,
        });

      // Minimize transaction records payload for cloud execution
      const minimizedData = transactions.map((t) => ({
        date: t.date,
        amount: t.amount,
        base_amount: t.base_amount || t.amount,
        currency: t.currency || "INR",
        category: t.category,
        note: t.note || "",
        type: t.type || "expense",
      }));

      const categoryPayload = categories.map((c) => ({
        name: c.name,
        subcategories: c.subcategories.slice(0, 12),
        ...(c.type ? { type: c.type } : {}),
      }));

      // Call Rate-Limited Edge Function
      const { data, error } = await supabase.functions.invoke("ask-data", {
        body: {
          query: textToSend,
          transactions: minimizedData,
          categories: categoryPayload,
          today: localTodayISO(),
          userName: profile?.name || user?.email?.split("@")[0],
        },
      });

      if (error) {
        let serverErrorMsg = error.message;
        try {
          const bodyText = await error.context?.response?.text();
          if (bodyText) {
            const parsed = JSON.parse(bodyText);
            if (parsed.error) serverErrorMsg = parsed.error;
          }
        } catch {
          // Keep default message
        }
        throw new Error(serverErrorMsg);
      }

      if (data) {
        let assistantActionsParsed =
          coerceAssistantActionsFromApi((data as { assistant_actions?: unknown }).assistant_actions) ?? null;
        if (assistantActionsParsed) {
          const knownNames = new Set(categories.map((c) => c.name.toLowerCase()));
          assistantActionsParsed = validateAgainstKnownCategories(assistantActionsParsed, knownNames);
          if (
            assistantActionsParsed.categoriesToAdd.length === 0 &&
            assistantActionsParsed.transactionsToAdd.length === 0
          ) {
            assistantActionsParsed = null;
          }
        }

        const persistActions: Json | null = assistantActionsParsed
          ? (JSON.parse(JSON.stringify(assistantActionsParsed)) as Json)
          : null;

        const { data: insertedRow, error: botInsErr } = await supabase
          .from("ai_chat_messages")
          .insert({
            session_id: targetSessionId,
            sender: "bot",
            text: data.reply,
            chart_data: data.chartData && data.chartData.length > 0 ? data.chartData : null,
            assistant_actions: persistActions,
          })
          .select("id")
          .single();

        if (botInsErr) console.error("Failed to persist Maya reply:", botInsErr);

        const botMessage: Message = {
          id: insertedRow?.id ?? crypto.randomUUID(),
          sender: "bot",
          text: data.reply,
          chartData: data.chartData && data.chartData.length > 0 ? data.chartData : undefined,
          assistantActions: assistantActionsParsed,
        };
        setMessages((prev) => [...prev, botMessage]);
        vibrate([40, 60]); // Premium vibration feedback
      }
    } catch (err: unknown) {
      console.error("Ask Data failure:", err);
      const errMsg = err instanceof Error ? err.message : "I ran into an unexpected error. Please try again.";
      setMessages((prev) => [
        ...prev,
        {
          id: Math.random().toString(),
          sender: "bot",
          text: errMsg,
        },
      ]);
    } finally {
      setLoading(false);
    }
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        hideCloseButton
        className="bg-background border-border rounded-t-[32px] h-[90dvh] md:h-[80vh] flex flex-col p-0 overflow-hidden"
        style={
          typeof window !== "undefined" && window.innerWidth < 768 && visualHeight
            ? { height: `${Math.min(visualHeight, window.innerHeight * 0.9)}px` }
            : undefined
        }
      >
        <div className="flex flex-1 overflow-hidden h-full">
          {/* ================= DESKTOP HISTORY SIDEBAR ================= */}
          <div className="hidden md:flex flex-col w-[260px] shrink-0 border-r border-border/40 bg-surface/20 p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-border/20 pb-3 shrink-0">
              <span className="text-xs font-semibold text-ink-muted tracking-wider uppercase">Saved Chats</span>
              <button
                type="button"
                onClick={handleNewChat}
                className="p-1.5 rounded-full hover:bg-surface border border-border/40 text-foreground transition-all active:scale-95"
                title="New Conversation"
              >
                <Plus className="h-3.5 w-3.5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
              {sessionsLoading ? (
                <div className="flex items-center justify-center p-4">
                  <Loader2 className="h-4 w-4 animate-spin text-ink-muted" />
                </div>
              ) : sessions.length === 0 ? (
                <div className="text-center p-4 text-xs text-ink-muted/60">No threads logged yet.</div>
              ) : (
                sessions.map((s) => {
                  const isActive = s.id === activeSessionId;
                  const isRenaming = s.id === renamingId;

                  return (
                    <div
                      key={s.id}
                      onClick={() => !isRenaming && setActiveSessionId(s.id)}
                      className={cn(
                        "group relative flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer text-xs font-medium transition-all",
                        isActive 
                          ? "bg-foreground text-background" 
                          : "text-foreground hover:bg-surface/50"
                      )}
                    >
                      <div className="flex items-center gap-2.5 max-w-[70%]">
                        <MessageSquare className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-background" : "text-ink-muted")} />
                        {isRenaming ? (
                          <input
                            type="text"
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === "Enter") {
                                e.preventDefault();
                                handleRenameSession(s.id);
                              }
                              if (e.key === "Escape") setRenamingId(null);
                            }}
                            autoFocus
                            onClick={(e) => e.stopPropagation()}
                            className="bg-transparent border-b border-background/40 focus:border-background focus:outline-none w-full text-xs text-background font-medium py-0 px-0.5"
                          />
                        ) : (
                          <span className="truncate">{s.title}</span>
                        )}
                      </div>

                      {/* Controls on Hover */}
                      <div className={cn(
                        "flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity shrink-0",
                        isActive && "opacity-100" // Always show controls for active tab
                      )}>
                        {isRenaming ? (
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRenameSession(s.id);
                              }}
                              className="p-1 rounded-md hover:bg-background/20"
                            >
                              <Check className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenamingId(null);
                              }}
                              className="p-1 rounded-md hover:bg-background/20"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                        ) : (
                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setRenamingId(s.id);
                                setRenameValue(s.title);
                              }}
                              className="p-1 rounded-md hover:bg-background/20"
                            >
                              <Edit3 className="h-3 w-3" />
                            </button>
                            <button
                              type="button"
                              onClick={(e) => handleDeleteSession(s.id, e)}
                              className="p-1 rounded-md hover:bg-background/20"
                            >
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>

          {/* ================= MAIN CHAT INTERFACE ================= */}
          <div className="flex-1 flex flex-col overflow-hidden h-full bg-background">
            {/* Header — compact */}
            <div className="px-4 py-2 border-b border-border/20 flex items-center justify-between gap-2 shrink-0 min-h-[44px]">
              <SheetHeader className="text-left space-y-0 p-0 flex-1 min-w-0">
                <SheetTitle className="text-sm font-medium text-foreground flex items-center gap-2 m-0">
                  <button
                    type="button"
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    className="md:hidden p-1 rounded-md text-ink-muted/70 hover:text-foreground transition-colors shrink-0"
                    aria-label="Chat history"
                  >
                    <Menu className="h-3.5 w-3.5" />
                  </button>
                  <img
                    src="/maya.png"
                    alt=""
                    className="h-5 w-5 rounded-full object-cover shrink-0 opacity-90"
                  />
                  <span className="truncate">{MAYA_TITLE}</span>
                </SheetTitle>
              </SheetHeader>

              <button
                type="button"
                onClick={handleNewChat}
                className="md:hidden flex items-center gap-1 px-2 py-1 text-[11px] font-medium text-ink-muted/60 hover:text-foreground transition-colors shrink-0"
              >
                <Plus className="h-3 w-3" />
                New
              </button>
            </div>

            {/* Messages list */}
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-6 py-8 custom-scrollbar bg-background flex flex-col min-h-0"
            >
              {messagesLoading ? (
                <div className="flex flex-col items-center justify-center flex-1 min-h-[12rem] space-y-3">
                  <Loader2 className="h-6 w-6 animate-spin text-ink-muted" />
                  <p className="text-xs text-ink-muted italic">Retrieving conversations...</p>
                </div>
              ) : messages.length === 0 && !loading ? (
                <div className="flex-1 flex flex-col items-center justify-center text-center px-2 py-6 min-h-[min(420px,55vh)]">
                  <img
                    src="/maya.png"
                    alt=""
                    className="h-12 w-12 rounded-full object-cover border border-purple-500/15 shadow-sm mb-4"
                  />
                  <p className="font-serif text-lg text-foreground tracking-tight mb-2">Maya</p>
                  <p className="text-[13px] text-ink-muted leading-relaxed max-w-[300px] mb-6">
                    {MAYA_INTRO}
                  </p>
                  <div className="flex flex-wrap justify-center gap-2 max-w-md w-full">
                    {SUGGESTED_QUERIES.map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => void handleSend(q)}
                        className="px-3 py-2 rounded-full border border-border/60 bg-background/80 text-left text-[11px] font-medium text-foreground/90 hover:bg-surface hover:border-border transition-colors active:scale-[0.98]"
                      >
                        {q}
                      </button>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="max-w-2xl">
                {messages.map((m, idx) => {
                  const isUser = m.sender === "user";
                  const prev = messages[idx - 1];
                  const spacing =
                    idx === 0
                      ? ""
                      : isUser && prev?.sender === "bot"
                        ? "mt-12"
                        : !isUser && prev?.sender === "user"
                          ? "mt-4"
                          : "mt-8";

                  return (
                    <div
                      key={m.id}
                      className={cn(
                        "w-full text-left animate-in fade-in duration-300 ease-out-soft motion-reduce:animate-none",
                        spacing,
                      )}
                    >
                      {isUser ? (
                        <p className="text-[15px] leading-relaxed font-normal text-ink-muted/55 dark:text-foreground/45">
                          {m.text}
                        </p>
                      ) : (
                      <div className="space-y-6">
                        <MayaBotText text={m.text} />

                        {m.assistantActions &&
                          (m.assistantActions.categoriesToAdd.length > 0 ||
                            m.assistantActions.transactionsToAdd.length > 0) && (
                          <div className="border-t border-border/30 pt-5 space-y-3 animate-in fade-in duration-300">
                            <div className="flex items-start gap-2 text-[11px] font-medium uppercase tracking-wider text-ink-muted/70">
                              <ListPlus className="h-3.5 w-3.5 mt-0.5 text-emerald-600 dark:text-emerald-400 shrink-0" />
                              Ready to add
                            </div>
                            {m.assistantActions.categoriesToAdd.length > 0 && (
                              <ul className="space-y-1 text-sm text-foreground list-disc list-inside">
                                {m.assistantActions.categoriesToAdd.map((c) => (
                                  <li key={`cat-${c.name}`}>
                                    <span className="font-medium">{c.name}</span>
                                    {c.type === "income" ? (
                                      <span className="text-ink-muted"> · income category</span>
                                    ) : null}
                                    {c.subcategories?.length ? (
                                      <span className="text-ink-muted">
                                        {" "}
                                        · subs: {c.subcategories.join(", ")}
                                      </span>
                                    ) : null}
                                  </li>
                                ))}
                              </ul>
                            )}
                            {m.assistantActions.transactionsToAdd.length > 0 && (
                              <ul className="space-y-1.5 text-sm text-foreground list-none pl-0">
                                {m.assistantActions.transactionsToAdd.map((t, idx) => (
                                  <li
                                    key={`${t.date}-${t.category}-${t.amount}-${idx}`}
                                    className="py-1 text-foreground/90"
                                  >
                                    <span className="font-semibold">
                                      {getCurrencySymbol()}
                                      {formatINR(t.amount)}
                                    </span>
                                    <span className="text-ink-muted">
                                      {" "}
                                      · {t.category}
                                      {t.note ? (
                                        <>
                                          {" "}
                                          · <span className="italic">{t.note}</span>
                                        </>
                                      ) : null}
                                    </span>
                                    <span className="text-ink-muted">
                                      {" "}
                                      · {t.date}
                                    </span>
                                    <span className="block text-[11px] text-ink-muted/80 uppercase tracking-wide mt-0.5">
                                      {t.txnType === "income" ? "Income" : "Expense"} · {t.payment_method}
                                    </span>
                                  </li>
                                ))}
                              </ul>
                            )}
                            <Button
                              size="sm"
                              variant="outline"
                              className="w-full max-w-xs rounded-full font-medium border-border/50"
                              disabled={applyingActionsForId === m.id}
                              onClick={() => void applyMayaSuggestions(m)}
                            >
                              {applyingActionsForId === m.id ? (
                                <>
                                  <Loader2 className="h-4 w-4 animate-spin mr-2" />
                                  Saving…
                                </>
                              ) : (
                                "Add to Finlo"
                              )}
                            </Button>
                          </div>
                        )}

                        {/* Render Chart directly inside chat bubbles! */}
                        {m.chartData && (
                          <div className="border-t border-border/30 pt-5 w-full h-56 max-w-md animate-in fade-in duration-300">
                            <div className="flex items-center gap-1.5 text-[11px] text-ink-muted/70 mb-4 font-medium uppercase tracking-wider">
                              <BarChart4 className="h-3.5 w-3.5 text-ink-muted/60" />
                              Chart
                            </div>
                            <ResponsiveContainer width="100%" height="80%">
                              <BarChart data={m.chartData} margin={{ top: 0, right: 0, left: -25, bottom: 0 }}>
                                <XAxis 
                                  dataKey="label" 
                                  stroke="currentColor" 
                                  className="text-ink-muted/50 text-[10px]" 
                                  tickLine={false}
                                />
                                <YAxis 
                                  stroke="currentColor" 
                                  className="text-ink-muted/50 text-[10px]" 
                                  tickLine={false}
                                />
                                <Tooltip
                                  cursor={{ fill: "rgba(0,0,0,0.03)" }}
                                  content={({ active, payload }) => {
                                    if (active && payload && payload.length) {
                                      return (
                                        <div className="bg-popover border border-border rounded-xl p-2.5 shadow-sm text-xs">
                                          <p className="font-semibold text-foreground capitalize mb-0.5">{payload[0].payload.label}</p>
                                          <p className="font-serif font-semibold text-emerald-600 dark:text-emerald-400">
                                            {getCurrencySymbol()}{formatINR(payload[0].value as number)}
                                          </p>
                                        </div>
                                      );
                                    }
                                    return null;
                                  }}
                                />
                                <Bar 
                                  dataKey="value" 
                                  fill="hsl(var(--foreground))" 
                                  radius={[6, 6, 0, 0]} 
                                />
                              </BarChart>
                            </ResponsiveContainer>
                          </div>
                        )}
                      </div>
                      )}
                    </div>
                  );
                })}
                {loading && (
                  <p
                    className={cn(
                      "text-[15px] text-ink-muted/50 italic animate-pulse motion-reduce:animate-none",
                      messages.length > 0 && messages[messages.length - 1]?.sender === "user" ? "mt-4" : "mt-8",
                    )}
                  >
                    Thinking…
                  </p>
                )}
                </div>
              )}
            </div>

            {/* Input — minimal, matches message typography */}
            <div className="shrink-0 border-t border-border/20 bg-background px-6 py-5">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend(input);
                }}
                className="flex items-center gap-4 max-w-2xl w-full"
              >
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={loading}
                  placeholder="Ask Maya anything…"
                  className={cn(
                    "flex-1 min-w-0 border-0 border-b border-transparent bg-transparent",
                    "h-auto min-h-[2.25rem] py-1 px-0 shadow-none rounded-none",
                    "text-[15px] leading-relaxed font-normal text-foreground",
                    "placeholder:text-ink-muted/45 dark:placeholder:text-foreground/35",
                    "focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-border/30",
                    "disabled:opacity-50 transition-colors duration-200",
                  )}
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  aria-label="Send message"
                  className={cn(
                    "shrink-0 p-1 -mr-1 transition-colors duration-200",
                    "text-ink-muted/40 hover:text-foreground",
                    "disabled:opacity-25 disabled:pointer-events-none",
                    input.trim() && !loading && "text-foreground",
                  )}
                >
                  {loading ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <Send className="h-4 w-4" strokeWidth={1.75} />
                  )}
                </button>
              </form>
            </div>
          </div>
        </div>

        {/* ================= MOBILE NAVIGATION OVERLAY DRAWER ================= */}
        {sidebarOpen && (
          <div 
            className="md:hidden absolute inset-0 bg-black/60 z-10 animate-in fade-in duration-200"
            onClick={() => setSidebarOpen(false)}
          >
            <div 
              className="absolute left-0 top-0 bottom-0 w-[260px] bg-background border-r border-border p-4 flex flex-col space-y-4 animate-in slide-in-from-left duration-200"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-border/20 pb-3 shrink-0">
                <span className="text-xs font-semibold text-ink-muted tracking-wider uppercase">Saved Chats</span>
                <div className="flex items-center gap-1.5">
                  <button
                    type="button"
                    onClick={handleNewChat}
                    className="p-1.5 rounded-full hover:bg-surface border border-border/40 text-foreground transition-all active:scale-95"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setSidebarOpen(false)}
                    className="p-1.5 rounded-full hover:bg-surface text-ink-muted transition-all"
                  >
                    <X className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto space-y-1.5 pr-1 custom-scrollbar">
                {sessionsLoading ? (
                  <div className="flex items-center justify-center p-4">
                    <Loader2 className="h-4 w-4 animate-spin text-ink-muted" />
                  </div>
                ) : sessions.length === 0 ? (
                  <div className="text-center p-4 text-xs text-ink-muted/60">No threads logged yet.</div>
                ) : (
                  sessions.map((s) => {
                    const isActive = s.id === activeSessionId;
                    const isRenaming = s.id === renamingId;

                    return (
                      <div
                        key={s.id}
                        onClick={() => {
                          if (!isRenaming) {
                            setActiveSessionId(s.id);
                            setSidebarOpen(false);
                          }
                        }}
                        className={cn(
                          "group relative flex items-center justify-between px-3 py-2.5 rounded-xl cursor-pointer text-xs font-medium transition-all",
                          isActive 
                            ? "bg-foreground text-background" 
                            : "text-foreground hover:bg-surface/50"
                        )}
                      >
                        <div className="flex items-center gap-2.5 max-w-[70%]">
                          <MessageSquare className={cn("h-3.5 w-3.5 shrink-0", isActive ? "text-background" : "text-ink-muted")} />
                          {isRenaming ? (
                            <input
                              type="text"
                              value={renameValue}
                              onChange={(e) => setRenameValue(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") {
                                  e.preventDefault();
                                  handleRenameSession(s.id);
                                }
                                if (e.key === "Escape") setRenamingId(null);
                              }}
                              autoFocus
                              onClick={(e) => e.stopPropagation()}
                              className="bg-transparent border-b border-background/40 focus:border-background focus:outline-none w-full text-xs text-background font-medium py-0"
                            />
                          ) : (
                            <span className="truncate">{s.title}</span>
                          )}
                        </div>

                        <div className="flex items-center gap-0.5 shrink-0">
                          {isRenaming ? (
                            <div className="flex items-center gap-0.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRenameSession(s.id);
                                }}
                                className="p-1 rounded-md hover:bg-background/20"
                              >
                                <Check className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRenamingId(null);
                                }}
                                className="p-1 rounded-md hover:bg-background/20"
                              >
                                <X className="h-3 w-3" />
                              </button>
                            </div>
                          ) : (
                            <div className="flex items-center gap-0.5">
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setRenamingId(s.id);
                                  setRenameValue(s.title);
                                }}
                                className="p-1 rounded-md hover:bg-background/20"
                              >
                                <Edit3 className="h-3 w-3" />
                              </button>
                              <button
                                type="button"
                                onClick={(e) => handleDeleteSession(s.id, e)}
                                className="p-1 rounded-md hover:bg-background/20"
                              >
                                <Trash2 className="h-3 w-3" />
                              </button>
                            </div>
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
