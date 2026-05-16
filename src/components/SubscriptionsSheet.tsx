import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { getCurrencySymbol, CategoryDef, formatINR, todayISO, Expense } from "@/lib/expenses";
import { useEffect, useState, useCallback, useMemo } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2, Loader2, CreditCard, Sparkles, AlertCircle, Bell } from "lucide-react";
import { cn } from "@/lib/utils";
import { RollingDatePicker } from "./RollingDatePicker";
import { detectSubscriptions, DetectedSubscription } from "@/lib/subscriptions";

interface Subscription {
  id: string;
  service_name: string;
  amount: number;
  category: string;
  billing_cycle: "monthly" | "weekly" | "yearly";
  next_billing_date: string;
  alert_days_before: number;
  active: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categories: CategoryDef[];
  userId: string | null;
  expenses: Expense[];
}

export function SubscriptionsSheet({ open, onOpenChange, categories, userId, expenses }: Props) {
  const [subs, setSubs] = useState<Subscription[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [tab, setTab] = useState<"active" | "detected">("active");

  const [draft, setDraft] = useState({
    service_name: "",
    amount: "",
    category: "",
    billing_cycle: "monthly" as "monthly" | "weekly" | "yearly",
    next_billing_date: todayISO(),
    alert_days_before: "1",
  });

  const detected = useMemo(() => detectSubscriptions(expenses), [expenses]);

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("subscriptions")
      .select("*")
      .eq("user_id", userId)
      .order("next_billing_date", { ascending: true });
    setLoading(false);
    if (error) { toast({ title: "Failed to load", description: error.message, variant: "destructive" }); return; }
    setSubs((data ?? []) as Subscription[]);
  }, [userId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const save = async (customDraft?: Partial<typeof draft>) => {
    if (!userId || saving) return;
    const finalDraft = { ...draft, ...customDraft };
    const amt = parseFloat(finalDraft.amount);
    if (!finalDraft.service_name || !amt || amt <= 0) {
      toast({ title: "Missing fields", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("subscriptions").insert({
      user_id: userId,
      service_name: finalDraft.service_name,
      amount: amt,
      category: finalDraft.category || "Bills",
      billing_cycle: finalDraft.billing_cycle,
      next_billing_date: finalDraft.next_billing_date,
      alert_days_before: parseInt(finalDraft.alert_days_before, 10) || 1,
    });
    setSaving(false);
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Subscription added" });
    setShowForm(false);
    setDraft({ service_name: "", amount: "", category: "", billing_cycle: "monthly", next_billing_date: todayISO(), alert_days_before: "1" });
    await load();
  };

  const remove = async (id: string) => {
    if (!confirm("Remove this subscription?")) return;
    await supabase.from("subscriptions").delete().eq("id", id);
    setSubs((s) => s.filter((x) => x.id !== id));
  };

  const toggle = async (id: string, active: boolean) => {
    await supabase.from("subscriptions").update({ active }).eq("id", id);
    setSubs((s) => s.map((x) => x.id === id ? { ...x, active } : x));
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="bg-background border-border rounded-t-[32px] max-h-[92vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="font-serif text-3xl font-normal text-foreground flex items-center gap-2">
            <CreditCard className="h-6 w-6" /> Subscriptions
          </SheetTitle>
          <p className="text-xs text-ink-muted">Manage your recurring services and get alerts before billing.</p>
        </SheetHeader>

        <div className="mt-6 flex gap-1 p-1 bg-surface/50 rounded-full text-xs max-w-sm mx-auto">
          {(["active", "detected"] as const).map((t) => (
            <button
              key={t}
              onClick={() => setTab(t)}
              className={cn(
                "flex-1 py-1.5 rounded-full capitalize font-semibold transition-all flex items-center justify-center gap-1.5",
                tab === t ? "bg-background text-foreground shadow-sm" : "text-ink-muted hover:text-foreground"
              )}
            >
              {t === "detected" && <Sparkles className="h-3 w-3" />}
              {t} {t === "detected" && detected.length > 0 && `(${detected.length})`}
            </button>
          ))}
        </div>

        {tab === "active" && (
          <div className="mt-4 space-y-4">
            {!showForm ? (
              <Button onClick={() => setShowForm(true)} variant="outline" className="w-full rounded-full border-dashed">
                <Plus className="h-4 w-4 mr-2" /> Add manually
              </Button>
            ) : (
              <div className="p-4 rounded-2xl border border-border/40 bg-surface/40 space-y-3 animate-in fade-in slide-in-from-top-2">
                <div className="grid grid-cols-2 gap-3">
                  <div className="col-span-2">
                    <Label className="text-[10px] uppercase tracking-widest text-ink-muted">Service Name</Label>
                    <Input value={draft.service_name} onChange={(e) => setDraft({ ...draft, service_name: e.target.value })}
                      placeholder="Netflix, Apple Music..." className="rounded-full bg-background mt-1" />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-widest text-ink-muted">Amount</Label>
                    <Input type="number" value={draft.amount} onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                      placeholder="0.00" className="rounded-full bg-background mt-1" />
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-widest text-ink-muted">Category</Label>
                    <Select value={draft.category} onValueChange={(v) => setDraft({ ...draft, category: v })}>
                      <SelectTrigger className="rounded-full bg-background mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {categories.map((c) => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-widest text-ink-muted">Cycle</Label>
                    <Select value={draft.billing_cycle} onValueChange={(v: any) => setDraft({ ...draft, billing_cycle: v })}>
                      <SelectTrigger className="rounded-full bg-background mt-1"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="monthly">Monthly</SelectItem>
                        <SelectItem value="weekly">Weekly</SelectItem>
                        <SelectItem value="yearly">Yearly</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div>
                    <Label className="text-[10px] uppercase tracking-widest text-ink-muted">Next Date</Label>
                    <RollingDatePicker value={draft.next_billing_date} onChange={(v) => setDraft({ ...draft, next_billing_date: v })} className="mt-1" />
                  </div>
                </div>
                <Button onClick={() => save()} disabled={saving} className="w-full rounded-full">{saving ? "Saving..." : "Save Subscription"}</Button>
              </div>
            )}

            <div className="space-y-2 pb-12">
              {loading ? (
                <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-ink-muted" /></div>
              ) : subs.length === 0 ? (
                <div className="text-center py-12 px-6 rounded-3xl border border-dashed border-border/60">
                  <Bell className="h-8 w-8 mx-auto text-ink-muted/30 mb-2" />
                  <p className="text-sm text-ink-muted">No active subscriptions. We'll alert you here before your bills are due.</p>
                </div>
              ) : subs.map((s) => (
                <div key={s.id} className="p-4 rounded-2xl border border-border/40 bg-card flex items-center gap-4">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-foreground">{s.service_name}</span>
                      <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-surface text-ink-muted uppercase tracking-tighter">{s.billing_cycle}</span>
                    </div>
                    <div className="text-xs text-ink-muted mt-0.5">
                      Next bill: {s.next_billing_date} · {getCurrencySymbol()}{formatINR(s.amount)}
                    </div>
                  </div>
                  <Switch checked={s.active} onCheckedChange={(v) => toggle(s.id, v)} />
                  <button onClick={() => remove(s.id)} className="p-2 text-ink-muted hover:text-destructive transition-colors"><Trash2 className="h-4 w-4" /></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {tab === "detected" && (
          <div className="mt-4 space-y-4 pb-12">
            {detected.length === 0 ? (
              <div className="text-center py-12 px-6 rounded-3xl border border-dashed border-border/60">
                <Sparkles className="h-8 w-8 mx-auto text-ink-muted/30 mb-2" />
                <p className="text-sm text-ink-muted">Scan complete. No recurring patterns found yet. Keep logging your expenses!</p>
              </div>
            ) : (
              <>
                <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/10 flex items-start gap-3">
                  <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                  <p className="text-[11px] text-amber-700 dark:text-amber-400">We found these recurring expenses. Add them as subscriptions to get alerts and track them better.</p>
                </div>
                {detected.map((d, i) => (
                  <div key={i} className="p-4 rounded-2xl border border-border/40 bg-surface/30 flex items-center gap-4">
                    <div className="flex-1">
                      <div className="font-medium text-foreground">{d.service_name}</div>
                      <div className="text-xs text-ink-muted">
                        Seen {d.count} times · ~{getCurrencySymbol()}{formatINR(d.amount)} {d.billing_cycle}
                      </div>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => save({
                        service_name: d.service_name,
                        amount: String(d.amount),
                        category: d.category,
                        billing_cycle: d.billing_cycle,
                        next_billing_date: todayISO() // Ideally we predict the next date
                      })}
                      className="rounded-full bg-foreground text-background text-xs h-8"
                    >
                      Add
                    </Button>
                  </div>
                ))}
              </>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
