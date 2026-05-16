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
  Clock
} from "lucide-react";
import { cn, vibrate } from "@/lib/utils";
import { formatDistanceToNow } from "date-fns";

interface Activity {
  id: string;
  title: string;
  body: string;
  url?: string;
  created_at: string;
  is_read: boolean;
}

interface Props {
  userId: string | null;
  className?: string;
}

export function ActivityWire({ userId, className }: Props) {
  const [activities, setActivities] = useState<Activity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!userId) return;

    const fetchActivities = async () => {
      const { data, error } = await supabase
        .from("notifications")
        .select("*")
        .eq("user_id", userId)
        .order("created_at", { ascending: false })
        .limit(10);

      if (data) {
        setActivities(data as Activity[]);
      }
      setLoading(false);
    };

    fetchActivities();

    const channel = supabase
      .channel("activity_wire_changes")
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "notifications", filter: `user_id=eq.${userId}` },
        (payload) => {
          setActivities(prev => [payload.new as Activity, ...prev].slice(0, 10));
          vibrate(40);
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [userId]);

  const getIcon = (title: string) => {
    const t = title.toLowerCase();
    if (t.includes("expense") || t.includes("spent")) return <ShoppingBag className="h-4 w-4 text-rose-500" />;
    if (t.includes("income") || t.includes("added")) return <ArrowUpRight className="h-4 w-4 text-emerald-500" />;
    if (t.includes("goal") || t.includes("target")) return <Target className="h-4 w-4 text-primary" />;
    if (t.includes("invite") || t.includes("household")) return <UserPlus className="h-4 w-4 text-indigo-500" />;
    return <Info className="h-4 w-4 text-ink-muted" />;
  };

  if (loading) {
    return (
      <div className={cn("space-y-3", className)}>
        {[1, 2, 3].map(i => (
          <div key={i} className="h-16 rounded-2xl bg-surface/20 animate-pulse" />
        ))}
      </div>
    );
  }

  if (activities.length === 0) {
    return (
      <Card className={cn("border border-border/40 p-8 text-center bg-surface/10 backdrop-blur-sm rounded-[24px]", className)}>
        <Bell className="h-8 w-8 mx-auto text-ink-muted/30 mb-3" />
        <p className="text-sm text-ink-muted">No recent activity</p>
        <p className="text-[10px] text-ink-muted/60 mt-1 uppercase tracking-wider">Shared events will appear here</p>
      </Card>
    );
  }

  return (
    <div className={cn("space-y-3", className)}>
      {activities.map((item) => (
        <Card 
          key={item.id} 
          className="relative overflow-hidden border border-border/30 p-4 bg-surface/20 backdrop-blur-md rounded-[20px] group hover:border-primary/20 transition-all duration-300"
        >
          <div className="flex gap-4">
            <div className="mt-0.5 h-8 w-8 rounded-full bg-background flex items-center justify-center border border-border/40 shadow-xs shrink-0">
              {getIcon(item.title)}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between gap-2">
                <p className="text-[13px] font-semibold text-foreground truncate">{item.title}</p>
                <div className="flex items-center gap-1 text-[10px] text-ink-muted whitespace-nowrap">
                  <Clock className="h-3 w-3" />
                  {formatDistanceToNow(new Date(item.created_at), { addSuffix: true })}
                </div>
              </div>
              <p className="text-xs text-ink-muted mt-0.5 line-clamp-2 leading-relaxed">
                {item.body}
              </p>
            </div>
          </div>
        </Card>
      ))}
    </div>
  );
}
