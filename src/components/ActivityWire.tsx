import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Card } from "@/components/ui/card";
import {
  Bell,
  ShoppingBag,
  ArrowUpRight,
  Target,
  UserPlus,
  Info,
  Clock,
} from "lucide-react";
import { cn, vibrate } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";
import { parseAppNavigation } from "@/lib/appNavigation";

interface Activity {
  id: string;
  title: string;
  body: string | null;
  kind: string;
  link: string | null;
  created_at: string;
  read_at: string | null;
}

interface Props {
  userId: string | null;
  className?: string;
  compact?: boolean;
  onNavigate?: (intent: ReturnType<typeof parseAppNavigation>) => void;
}

export function ActivityWire({ userId, className, compact = false, onNavigate }: Props) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    const fetchActivities = async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("id, title, body, kind, link, created_at, read_at")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);

      if (error) {
        console.error("ActivityWire fetch", error);
      } else if (data) {
        setActivities(data as Activity[]);
      }
      setLoading(false);
    };

    void fetchActivities();

    const channel = supabase
      .channel("activity_wire_changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          setActivities((prev) => [payload.new as Activity, ...prev].slice(0, 10));
          vibrate(40);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [userId]);

  const handleTap = async (item: Activity) => {
    if (!item.read_at) {
      const readAt = new Date().toISOString();
      setActivities((prev) =>
        prev.map((a) => (a.id === item.id ? { ...a, read_at: readAt } : a)),
      );
      void supabase.from("notifications").update({ read_at: readAt }).eq("id", item.id);
    }
    const intent = parseAppNavigation(item.link);
    if (item.kind === "invite") {
      intent.openSettings = true;
      intent.settingsSection = "household";
    }
    if (item.kind === "reaction" || item.link?.includes("view=household")) {
      intent.viewMode = "household";
    }
    onNavigate?.(intent);
  };

  const getIcon = (title: string, kind: string) => {
    const t = title.toLowerCase();
    if (kind === "invite" || t.includes("invite") || t.includes("household")) {
      return <UserPlus className="h-4 w-4 text-indigo-500" />;
    }
    if (t.includes("expense") || t.includes("spent")) return <ShoppingBag className="h-4 w-4 text-rose-500" />;
    if (t.includes("income") || t.includes("added")) return <ArrowUpRight className="h-4 w-4 text-emerald-500" />;
    if (t.includes("goal") || t.includes("target")) return <Target className="h-4 w-4 text-primary" />;
    return <Info className="h-4 w-4 text-ink-muted" />;
  };

  if (loading) {
    return (
      <div className={cn(compact ? "space-y-2" : "space-y-3", className)}>
        {[1, 2].map((i) => (
          <div
            key={i}
            className={cn("bg-surface/20 animate-pulse", compact ? "h-10 rounded-xl" : "h-16 rounded-2xl")}
          />
        ))}
      </div>
    );
  }

  if (activities.length === 0) {
    if (compact) {
      return (
        <Card
          className={cn(
            "border border-border/40 px-3 py-2.5 flex items-center gap-2.5 bg-surface/10 backdrop-blur-sm rounded-xl",
            className,
          )}
        >
          <Bell className="h-4 w-4 text-ink-muted/35 shrink-0" />
          <div className="min-w-0 text-left">
            <p className="text-xs text-ink-muted leading-tight">No recent activity</p>
            <p className="text-[9px] text-ink-muted/55 uppercase tracking-wider leading-tight">
              Shared events appear here
            </p>
          </div>
        </Card>
      );
    }
    return (
      <Card className={cn("border border-border/40 p-8 text-center bg-surface/10 backdrop-blur-sm rounded-[24px]", className)}>
        <Bell className="h-8 w-8 mx-auto text-ink-muted/30 mb-3" />
        <p className="text-sm text-ink-muted">No recent activity</p>
        <p className="text-[10px] text-ink-muted/60 mt-1 uppercase tracking-wider">Shared events will appear here</p>
      </Card>
    );
  }

  return (
    <div className={cn(compact ? "space-y-2" : "space-y-3", className)}>
      {activities.map((item) => (
        <Card
          key={item.id}
          role="button"
          tabIndex={0}
          onClick={() => void handleTap(item)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              void handleTap(item);
            }
          }}
          className={cn(
            "relative overflow-hidden border text-left cursor-pointer transition-all duration-200",
            compact
              ? "border-border/30 p-3 bg-surface/20 rounded-xl hover:border-primary/20"
              : "border-border/30 p-4 bg-surface/20 backdrop-blur-md rounded-[20px] hover:border-primary/20",
            !item.read_at && "ring-1 ring-primary/15",
          )}
        >
          <div className={cn("flex gap-3", compact ? "items-center" : "gap-4")}>
            <div
              className={cn(
                "rounded-full bg-background flex items-center justify-center border border-border/40 shrink-0",
                compact ? "h-7 w-7" : "h-8 w-8 mt-0.5",
              )}
            >
              {getIcon(item.title, item.kind)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className={cn("font-semibold text-foreground truncate", compact ? "text-xs" : "text-[13px]")}>
                  {item.title}
                </p>
                <div className="flex items-center gap-1 text-[10px] text-ink-muted whitespace-nowrap shrink-0">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                </div>
              </div>
              {item.body && (
                <p className={cn("text-ink-muted mt-0.5 line-clamp-2 leading-relaxed", compact ? "text-[11px]" : "text-xs")}>
                  {item.body}
                </p>
              )}
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
