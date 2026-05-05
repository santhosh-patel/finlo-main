import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { CategoryDef, formatINR, todayISO } from "@/lib/expenses";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { Plus, Trash2, Loader2, Repeat } from "lucide-react";

interface Rule {
  id: string;
  amount: number;
  category: string;
  subcategory: string | null;
  note: string | null;
  payment_method: string;
  frequency: "monthly" | "weekly";
  day_of_month: number | null;
  day_of_week: number | null;
  next_due_date: string;
  active: boolean;
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  categories: CategoryDef[];
  userId: string | null;
}

export function RecurringSheet({ open, onOpenChange, categories, userId }: Props) {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState({
    amount: "",
    category: categories[0]?.name ?? "Bills",
    subcategory: "",
    note: "",
    payment_method: "upi",
    frequency: "monthly" as "monthly" | "weekly",
    day_of_month: String(new Date().getDate()),
    next_due_date: todayISO(),
  });

  const load = async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("recurring_expenses")
      .select("*")
      .eq("user_id", userId)
      .order("next_due_date", { ascending: true });
    setLoading(false);
    if (error) { toast({ title: "Failed to load", description: error.message, variant: "destructive" }); return; }
    setRules((data ?? []) as Rule[]);
  };

  useEffect(() => { if (open) load(); /* eslint-disable-next-line */ }, [open, userId]);

  const create = async () => {
    if (!userId) return;
    const amount = parseFloat(draft.amount);
    if (!Number.isFinite(amount) || amount <= 0) { toast({ title: "Enter a valid amount", variant: "destructive" }); return; }
    const dom = draft.frequency === "monthly" ? parseInt(draft.day_of_month, 10) : null;
    const { error } = await supabase.from("recurring_expenses").insert({
      user_id: userId,
      amount, category: draft.category,
      subcategory: draft.subcategory || null,
      note: draft.note || null,
      payment_method: draft.payment_method,
      frequency: draft.frequency,
      day_of_month: dom,
      next_due_date: draft.next_due_date,
      active: true,
    });
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Recurring rule added" });
    setShowForm(false);
    setDraft((d) => ({ ...d, amount: "", note: "", subcategory: "" }));
    await load();
  };

  const toggle = async (id: string, active: boolean) => {
    await supabase.from("recurring_expenses").update({ active }).eq("id", id);
    setRules((r) => r.map((x) => x.id === id ? { ...x, active } : x));
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this recurring rule?")) return;
    await supabase.from("recurring_expenses").delete().eq("id", id);
    setRules((r) => r.filter((x) => x.id !== id));
  };

  const runNow = async () => {
    setLoading(true);
    const { data, error } = await supabase.functions.invoke("process-recurring");
    setLoading(false);
    if (error) { toast({ title: "Run failed", description: error.message, variant: "destructive" }); return; }
    const created = (data as { created?: number })?.created ?? 0;
    toast({ title: "Processed", description: `${created} expense(s) created` });
    await load();
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="bottom" className="bg-background border-border rounded-t-[32px] max-h-[88vh] overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle className="font-serif text-3xl font-normal text-foreground flex items-center gap-2">
            <Repeat className="h-5 w-5" /> Recurring expenses
          </SheetTitle>
          <p className="text-xs text-ink-muted">Auto-create monthly bills like rent or subscriptions.</p>
        </SheetHeader>

        <div className="mt-4 flex gap-2">
          <Button size="sm" onClick={() => setShowForm((s) => !s)} className="rounded-full bg-foreground text-background hover:bg-foreground/90">
            <Plus className="h-4 w-4 mr-1" /> {showForm ? "Cancel" : "New rule"}
          </Button>
          <Button size="sm" variant="ghost" onClick={runNow} disabled={loading} className="rounded-full">
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Run due now"}
          </Button>
        </div>

        {showForm && (
          <div className="mt-4 rounded-2xl border border-border/40 bg-surface/40 p-4 space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[10px] tracking-[0.2em] uppercase text-ink-muted">Amount</Label>
                <Input type="number" inputMode="decimal" value={draft.amount}
                  onChange={(e) => setDraft({ ...draft, amount: e.target.value })}
                  className="rounded-full bg-background border-border" />
              </div>
              <div>
                <Label className="text-[10px] tracking-[0.2em] uppercase text-ink-muted">Category</Label>
                <Select value={draft.category} onValueChange={(v) => setDraft({ ...draft, category: v })}>
                  <SelectTrigger className="rounded-full bg-background border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>{categories.map((c) => <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] tracking-[0.2em] uppercase text-ink-muted">Frequency</Label>
                <Select value={draft.frequency} onValueChange={(v: "monthly" | "weekly") => setDraft({ ...draft, frequency: v })}>
                  <SelectTrigger className="rounded-full bg-background border-border"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="monthly">Monthly</SelectItem>
                    <SelectItem value="weekly">Weekly</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div>
                <Label className="text-[10px] tracking-[0.2em] uppercase text-ink-muted">Next due</Label>
                <Input type="date" value={draft.next_due_date}
                  onChange={(e) => setDraft({ ...draft, next_due_date: e.target.value })}
                  className="rounded-full bg-background border-border" />
              </div>
            </div>
            <div>
              <Label className="text-[10px] tracking-[0.2em] uppercase text-ink-muted">Note</Label>
              <Input value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                placeholder="e.g. Netflix subscription"
                className="rounded-full bg-background border-border" />
            </div>
            <Button onClick={create} className="w-full rounded-full bg-foreground text-background hover:bg-foreground/90">Save rule</Button>
          </div>
        )}

        <div className="mt-4 space-y-2 pb-8">
          {loading && rules.length === 0 ? (
            <div className="flex justify-center py-6"><Loader2 className="h-4 w-4 animate-spin text-ink-muted" /></div>
          ) : rules.length === 0 ? (
            <p className="text-center text-ink-muted text-sm py-8">No recurring rules yet.</p>
          ) : rules.map((r) => (
            <div key={r.id} className="rounded-2xl border border-border/40 bg-surface/30 p-3 flex items-center gap-3">
              <div className="flex-1 min-w-0">
                <div className="flex items-baseline gap-2">
                  <span className="font-serif text-lg text-foreground tabular-nums">₹{formatINR(r.amount)}</span>
                  <span className="text-xs text-foreground">{r.category}</span>
                </div>
                <p className="text-[11px] text-ink-muted truncate">
                  {r.frequency} · next {r.next_due_date}{r.note ? ` · ${r.note}` : ""}
                </p>
              </div>
              <Switch checked={r.active} onCheckedChange={(v) => toggle(r.id, v)} />
              <button onClick={() => remove(r.id)} className="p-1.5 text-ink-muted hover:text-destructive rounded-full hover:bg-surface" aria-label="Delete">
                <Trash2 className="h-3.5 w-3.5" />
              </button>
            </div>
          ))}
        </div>
      </SheetContent>
    </Sheet>
  );
}
