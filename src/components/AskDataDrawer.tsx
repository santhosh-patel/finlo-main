import { useState, useRef, useEffect, useCallback } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Input } from "@/components/ui/input";
import { 
  Send, 
  Loader2, 
  User, 
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
import { getCurrencySymbol, formatINR, Expense, CategoryDef } from "@/lib/expenses";
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
  addExpense: (e: Omit<Expense, "id" | "created_at">) => Expense;
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

export function AskDataDrawer({
  open,
  onOpenChange,
  transactions,
  categories,
  addExpense,
  addCategory,
}: Props) {
  const { user } = useAuth();
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

  // 1. Fetch conversations/sessions list
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
      
      // If we don't have an active session but list is not empty, set the first one as active
      if (sessionList.length > 0 && !activeSessionId) {
        setActiveSessionId(sessionList[0].id);
      }
    } catch (e) {
      console.error("Failed to load chat sessions:", e);
    } finally {
      setSessionsLoading(false);
    }
  }, [user?.id, activeSessionId]);

  // Load list on drawer mount/open
  useEffect(() => {
    if (open && user?.id) {
      loadSessions();
    }
  }, [open, user?.id, loadSessions]);

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
          title: `Conversation ${new Date().toLocaleDateString()}`
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

    let targetSessionId = activeSessionId;
    vibrate();

    // Securely auto-create session first if none is active
    if (!targetSessionId) {
      try {
        const { data, error } = await supabase
          .from("ai_chat_sessions")
          .insert({
            user_id: user.id,
            title: textToSend.substring(0, 30) + "..."
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
        className="bg-background border-border rounded-t-[32px] h-[90vh] md:h-[80vh] flex flex-col p-0 overflow-hidden"
      >
        <div className="flex flex-1 overflow-hidden h-full">
          {/* ================= DESKTOP HISTORY SIDEBAR ================= */}
          <div className="hidden md:flex flex-col w-[260px] shrink-0 border-r border-border/40 bg-surface/20 p-4 space-y-4">
            <div className="flex items-center justify-between border-b border-border/20 pb-3 shrink-0">
              <span className="text-xs font-semibold text-ink-muted tracking-wider uppercase">Saved Chats</span>
              <button
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
                              if (e.key === "Enter") handleRenameSession(s.id);
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
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRenameSession(s.id);
                              }}
                              className="p-1 rounded-md hover:bg-background/20"
                            >
                              <Check className="h-3 w-3" />
                            </button>
                            <button
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
            {/* Header */}
            <div className="p-4 border-b border-border/40 flex items-center justify-between shrink-0">
              <SheetHeader className="text-left">
                <SheetTitle className="font-serif text-xl font-normal text-foreground flex items-center gap-3">
                  {/* Menu burger on Mobile */}
                  <button
                    onClick={() => setSidebarOpen(!sidebarOpen)}
                    className="md:hidden p-1.5 rounded-lg border border-border/40 text-foreground transition-all shrink-0"
                  >
                    <Menu className="h-4 w-4" />
                  </button>

                  <img src="/maya.png" alt="Maya" className="h-9 w-9 rounded-full object-cover shrink-0 border border-purple-500/15 shadow-sm" />
                  <div className="flex flex-col text-left">
                    <span className="leading-tight">
                      {activeSessionId 
                        ? sessions.find((s) => s.id === activeSessionId)?.title || "Ask Maya"
                        : "Ask Maya"
                      }
                    </span>
                    <span className="text-[10px] text-ink-muted font-sans font-medium tracking-wide">Assistant</span>
                  </div>
                </SheetTitle>
              </SheetHeader>

              {/* Desktop quick new thread action */}
              <button
                onClick={handleNewChat}
                className="md:hidden flex items-center gap-1.5 px-3 py-1.5 rounded-full border border-border/40 text-xs font-semibold hover:bg-surface transition-all active:scale-95 text-foreground"
              >
                <Plus className="h-3.5 w-3.5" />
                New
              </button>
            </div>

            {/* Messages list */}
            <div 
              ref={scrollRef}
              className="flex-1 overflow-y-auto p-6 custom-scrollbar bg-surface/10 flex flex-col min-h-0"
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
                <div className="space-y-5">
                {messages.map((m) => {
                  const isUser = m.sender === "user";
                  return (
                    <div
                      key={m.id}
                      className={cn(
                        "flex items-start gap-3 max-w-[85%] md:max-w-[70%]",
                        isUser ? "ml-auto flex-row-reverse" : "mr-auto"
                      )}
                    >
                      {isUser ? (
                        <div className="h-8 w-8 rounded-full border bg-foreground border-foreground text-background flex items-center justify-center shrink-0">
                          <User className="h-4 w-4" />
                        </div>
                      ) : (
                        <img src="/maya.png" alt="Maya" className="h-8 w-8 rounded-full object-cover shrink-0 border border-purple-500/15 shadow-sm" />
                      )}

                      <div className="space-y-3.5">
                        <div
                          className={cn(
                            "rounded-2xl px-4 py-3 text-sm leading-relaxed",
                            isUser
                              ? "bg-foreground text-background font-medium"
                              : "bg-surface/60 border border-border/40 text-foreground"
                          )}
                        >
                          {m.text}
                        </div>

                        {!isUser &&
                          m.assistantActions &&
                          (m.assistantActions.categoriesToAdd.length > 0 ||
                            m.assistantActions.transactionsToAdd.length > 0) && (
                          <div className="rounded-2xl border border-border bg-surface/50 px-4 py-3 space-y-3 animate-in fade-in duration-300">
                            <div className="flex items-start gap-2 text-xs font-semibold uppercase tracking-wider text-ink-muted">
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
                                    className="rounded-lg bg-background/50 border border-border/50 px-2.5 py-1.5"
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
                              className="w-full rounded-full font-semibold"
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
                          <div className="rounded-2xl border border-border/40 bg-surface/40 p-4 w-full h-56 max-w-sm md:max-w-md animate-in fade-in duration-300">
                            <div className="flex items-center gap-1.5 text-xs text-ink-muted mb-4 font-semibold uppercase tracking-wider">
                              <BarChart4 className="h-3.5 w-3.5 text-amber-500" />
                              AI Computed Aggregates
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
                    </div>
                  );
                })}
                {loading && (
                  <div className="flex items-center gap-3 max-w-[80%] mr-auto">
                    <div className="relative h-8 w-8 shrink-0">
                      <img src="/maya.png" alt="Maya" className="h-full w-full rounded-full object-cover border border-purple-500/15" />
                      <span className="absolute inset-0 rounded-full border border-purple-500/50 border-t-transparent animate-spin" />
                    </div>
                    <div className="bg-surface/40 border border-border/40 rounded-2xl px-4 py-3 text-sm text-ink-muted italic flex items-center gap-2">
                      Maya is thinking...
                    </div>
                  </div>
                )}
                </div>
              )}
            </div>

            {/* Input box */}
            <div className="p-6 border-t border-border/40 bg-background shrink-0">
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  handleSend(input);
                }}
                className="relative flex items-center bg-surface/40 rounded-full border border-border/40 focus-within:border-foreground/20 focus-within:bg-surface/50 transition-all p-1.5 pl-5 pr-1.5"
              >
                <Input
                  ref={inputRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  disabled={loading}
                  placeholder="Ask anything, or 'Log ₹450 Food lunch today'…"
                  className="border-0 bg-transparent p-0 h-11 shadow-none focus-visible:ring-0 text-sm placeholder:text-ink-muted/50 text-foreground flex-1 pr-12 focus-visible:border-0"
                />
                <button
                  type="submit"
                  disabled={loading || !input.trim()}
                  className="h-10 w-10 rounded-full bg-foreground text-background flex items-center justify-center hover:bg-foreground/90 disabled:opacity-30 disabled:pointer-events-none transition-all active:scale-95 shrink-0"
                >
                  <Send className="h-4 w-4" />
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
                    onClick={handleNewChat}
                    className="p-1.5 rounded-full hover:bg-surface border border-border/40 text-foreground transition-all active:scale-95"
                  >
                    <Plus className="h-3.5 w-3.5" />
                  </button>
                  <button
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
                                if (e.key === "Enter") handleRenameSession(s.id);
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
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleRenameSession(s.id);
                                }}
                                className="p-1 rounded-md hover:bg-background/20"
                              >
                                <Check className="h-3 w-3" />
                              </button>
                              <button
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
