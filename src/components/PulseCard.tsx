import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Sparkles, X, ArrowRight, TrendingUp, AlertTriangle, Calendar, Info, Loader2, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/hooks/use-toast";

interface PulseAction {
  label: string;
  type: "navigate" | "action";
  payload: any;
}

interface Pulse {
  id: string;
  type: string;
  title: string;
  content: string;
  metrics: any;
  actions: PulseAction[];
  created_at: string;
}

interface Props {
  userId: string | null;
  onNavigate: (target: string, params?: any) => void;
  onAction?: (handler: string, data: any) => Promise<boolean>;
}

export function PulseCard({ userId, onNavigate, onAction }: Props) {
  const [pulse, setPulse] = useState<Pulse | null>(null);
  const [visible, setVisible] = useState(false);
  const [acting, setActing] = useState(false);

  useEffect(() => {
    if (!userId) return;

    const fetchPulse = async () => {
      const { data, error } = await supabase
        .from("daily_pulses")
        .select("*")
        .eq("user_id", userId)
        .eq("is_read", false)
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle();

      if (data) {
        setPulse(data as unknown as Pulse);
        setTimeout(() => setVisible(true), 500);
      }
    };

    fetchPulse();

    // Subscribe to new pulses
    const channel = supabase
      .channel("daily_pulses_changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "daily_pulses", filter: `user_id=eq.${userId}` },
        (payload) => {
          setPulse(payload.new as unknown as Pulse);
          setVisible(true);
        }
      )
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [userId]);

  const dismiss = async () => {
    if (!pulse) return;
    setVisible(false);
    await supabase.from("daily_pulses").update({ is_read: true }).eq("id", pulse.id);
    setTimeout(() => setPulse(null), 300);
  };

  const handleAction = async (action: PulseAction) => {
    if (acting) return;

    if (action.type === "navigate") {
      onNavigate(action.payload.target, action.payload);
      dismiss();
    } else if (onAction && action.payload.handler) {
      setActing(true);
      const success = await onAction(action.payload.handler, action.payload.data);
      setActing(false);
      if (success) dismiss();
    } else {
      toast({ title: "Action performed", description: action.label });
      dismiss();
    }
  };

  if (!pulse) return null;

  const actions = Array.isArray(pulse.actions) ? pulse.actions : [];
  const title = pulse.title ?? "";

  const getIcon = () => {
    switch (pulse.type) {
      case "budget_alert": return <AlertTriangle className="h-5 w-5 text-amber-500" />;
      case "weekend_plan": return <Calendar className="h-5 w-5 text-indigo-500" />;
      case "anomaly": return <TrendingUp className="h-5 w-5 text-rose-500" />;
      case "insight": 
        if (title.includes("Balance")) return <Users className="h-5 w-5 text-primary" />;
        return <Sparkles className="h-5 w-5 text-emerald-500" />;
      default: return <Sparkles className="h-5 w-5 text-emerald-500" />;
    }
  };

  const getBg = () => {
    switch (pulse.type) {
      case "budget_alert": return "bg-amber-500/5 border-amber-500/10";
      case "weekend_plan": return "bg-indigo-500/5 border-indigo-500/10";
      case "anomaly": return "bg-rose-500/5 border-rose-500/10";
      case "insight": return title.includes("Balance") ? "bg-primary/5 border-primary/10" : "bg-emerald-500/5 border-emerald-500/10";
      default: return "bg-emerald-500/5 border-emerald-500/10";
    }
  };

  return (
    <div className={cn(
      "px-4 transition-all duration-500 ease-out overflow-hidden",
      visible ? "max-h-[400px] opacity-100 mb-6" : "max-h-0 opacity-0 mb-0"
    )}>
      <Card className={cn(
        "relative overflow-hidden rounded-[24px] border p-5 shadow-sm",
        getBg()
      )}>
        <button
          onClick={dismiss}
          className="absolute right-4 top-4 p-1 rounded-full hover:bg-surface/50 text-ink-muted transition-colors"
        >
          <X className="h-4 w-4" />
        </button>

        <div className="flex items-start gap-4">
          <div className="mt-1 p-2 rounded-xl bg-background shadow-sm">
            {getIcon()}
          </div>
          <div className="flex-1 min-w-0 pr-6">
            <h3 className="text-sm font-semibold text-foreground flex items-center gap-2">
              {pulse.title}
              {pulse.type === 'morning_pulse' && <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-emerald-500/10 text-emerald-600 font-bold uppercase tracking-wider">New Insight</span>}
            </h3>
            <p className="mt-1 text-sm text-ink-muted leading-relaxed">
              {pulse.content}
            </p>

            <div className="mt-4 flex flex-wrap gap-2">
              {actions.map((action, i) => (
                <Button
                  key={i}
                  size="sm"
                  disabled={acting}
                  onClick={() => handleAction(action)}
                  className="rounded-full bg-foreground text-background hover:bg-foreground/90 h-8 px-4 text-xs font-medium"
                >
                  {acting && <Loader2 className="mr-2 h-3 w-3 animate-spin" />}
                  {action.label}
                  {!acting && <ArrowRight className="ml-1.5 h-3 w-3" />}
                </Button>
              ))}
              {actions.length === 0 && (
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={dismiss}
                  className="rounded-full h-8 px-4 text-xs text-ink-muted hover:text-foreground"
                >
                  Dismiss
                </Button>
              )}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
}
