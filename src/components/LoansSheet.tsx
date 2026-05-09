import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatINR, getCurrencySymbol, todayISO } from "@/lib/expenses";
import { ArrowDownLeft, ArrowUpRight, Check, Loader2, Plus, Trash2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { RollingDatePicker } from "./RollingDatePicker";

export interface Loan {
  id: string;
  counterparty: string;
  amount: number;
  currency: string;
  direction: "lent" | "borrowed";
  date: string;
  due_date: string | null;
  note: string | null;
  status: "open" | "settled";
}

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  userId: string | null;
}

export function LoansSheet({ open, onOpenChange, userId }: Props) {
  const [loans, setLoans] = useState<Loan[]>([]);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [draft, setDraft] = useState({
    counterparty: "",
    amount: "",
    direction: "lent" as "lent" | "borrowed",
    date: todayISO(),
    due_date: "",
    note: "",
  });

  const load = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    const { data, error } = await supabase
      .from("loans")
      .select("*")
      .eq("user_id", userId)
      .order("status", { ascending: true })
      .order("date", { ascending: false });
    setLoading(false);
    if (error) { toast({ title: "Failed to load", description: error.message, variant: "destructive" }); return; }
    setLoans((data ?? []) as Loan[]);
  }, [userId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const reset = () => setDraft({ counterparty: "", amount: "", direction: "lent", date: todayISO(), due_date: "", note: "" });

  const save = async () => {
    if (!userId) return;
    const amt = parseFloat(draft.amount);
    if (!draft.counterparty.trim() || !amt || amt <= 0) {
      toast({ title: "Missing fields", description: "Person and amount required.", variant: "destructive" });
      return;
    }
    const { error } = await supabase.from("loans").insert({
      user_id: userId,
      counterparty: draft.counterparty.trim(),
      amount: amt,
      direction: draft.direction,
      date: draft.date,
      due_date: draft.due_date || null,
      note: draft.note.trim() || null,
    });
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Loan added" });
    reset(); setShowForm(false); load();
  };

  const settle = async (id: string) => {
    const { error } = await supabase.from("loans").update({ status: "settled" }).eq("id", id);
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    load();
  };

  const remove = async (id: string) => {
    const { error } = await supabase.from("loans").delete().eq("id", id);
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    load();
  };

  const open_ = loans.filter((l) => l.status === "open");
  const owedToMe = open_.filter((l) => l.direction === "lent").reduce((a, b) => a + Number(b.amount), 0);
  const iOwe = open_.filter((l) => l.direction === "borrowed").reduce((a, b) => a + Number(b.amount), 0);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent side="right" className="bg-background border-border w-full sm:max-w-[520px] overflow-y-auto p-6">
        <SheetHeader className="text-left mb-6">
          <SheetTitle className="font-serif text-3xl font-normal text-foreground">Lending</SheetTitle>
          <p className="text-xs text-ink-muted mt-1">Track money you've lent out or borrowed.</p>
        </SheetHeader>

        <div className="grid grid-cols-2 gap-3 mb-6">
          <div className="rounded-2xl border border-border/50 bg-surface/40 p-4">
            <div className="text-[10px] uppercase tracking-wider text-ink-muted">Owed to me</div>
            <div className="font-serif text-2xl text-emerald-600 dark:text-emerald-400 mt-1">
              {getCurrencySymbol()}{formatINR(owedToMe)}
            </div>
          </div>
          <div className="rounded-2xl border border-border/50 bg-surface/40 p-4">
            <div className="text-[10px] uppercase tracking-wider text-ink-muted">I owe</div>
            <div className="font-serif text-2xl text-destructive mt-1">
              {getCurrencySymbol()}{formatINR(iOwe)}
            </div>
          </div>
        </div>

        {!showForm ? (
          <Button onClick={() => setShowForm(true)} variant="outline" className="w-full rounded-full mb-6">
            <Plus className="h-4 w-4 mr-2" /> Add loan
          </Button>
        ) : (
          <div className="space-y-3 p-4 rounded-2xl border border-border/50 bg-surface/40 mb-6">
            <div className="flex gap-2">
              {(["lent", "borrowed"] as const).map((d) => (
                <button
                  key={d} type="button"
                  onClick={() => setDraft((s) => ({ ...s, direction: d }))}
                  className={cn(
                    "flex-1 px-3 py-2 rounded-full text-xs uppercase tracking-wider border transition-colors",
                    draft.direction === d
                      ? "bg-foreground text-background border-foreground"
                      : "border-border text-ink-muted"
                  )}
                >{d === "lent" ? "I lent" : "I borrowed"}</button>
              ))}
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-ink-muted">Person</Label>
              <Input value={draft.counterparty} onChange={(e) => setDraft((s) => ({ ...s, counterparty: e.target.value }))}
                placeholder="Name" className="mt-1 rounded-full bg-background" maxLength={64} />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-ink-muted">Amount</Label>
                <Input type="number" inputMode="decimal" value={draft.amount}
                  onChange={(e) => setDraft((s) => ({ ...s, amount: e.target.value }))}
                  placeholder="0" className="mt-1 rounded-full bg-background" />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-ink-muted">Date</Label>
                <RollingDatePicker
                  value={draft.date}
                  max={todayISO()}
                  onChange={(val) => setDraft((s) => ({ ...s, date: val }))}
                  className="mt-1"
                />
              </div>
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-ink-muted">Due date (optional)</Label>
              <RollingDatePicker
                value={draft.due_date || ""}
                onChange={(val) => setDraft((s) => ({ ...s, due_date: val || null }))}
                className="mt-1"
                placeholder="Select due date"
              />
            </div>
            <div>
              <Label className="text-[10px] uppercase tracking-wider text-ink-muted">Note</Label>
              <Input value={draft.note} onChange={(e) => setDraft((s) => ({ ...s, note: e.target.value }))}
                placeholder="What's it for?" className="mt-1 rounded-full bg-background" maxLength={120} />
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={save} className="flex-1 rounded-full">Save</Button>
              <Button variant="ghost" onClick={() => { reset(); setShowForm(false); }} className="rounded-full">Cancel</Button>
            </div>
          </div>
        )}

        {loading ? (
          <div className="flex justify-center py-12"><Loader2 className="h-5 w-5 animate-spin text-ink-muted" /></div>
        ) : loans.length === 0 ? (
          <p className="text-center text-sm text-ink-muted py-8">No loans yet. Add one above.</p>
        ) : (
          <ul className="space-y-2">
            {loans.map((l) => (
              <li key={l.id} className={cn(
                "flex items-center gap-3 p-3 rounded-2xl border border-border/40",
                l.status === "settled" ? "opacity-50 bg-surface/20" : "bg-surface/40"
              )}>
                <div className={cn(
                  "h-9 w-9 rounded-full flex items-center justify-center shrink-0",
                  l.direction === "lent" ? "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400" : "bg-destructive/10 text-destructive"
                )}>
                  {l.direction === "lent" ? <ArrowUpRight className="h-4 w-4" /> : <ArrowDownLeft className="h-4 w-4" />}
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-foreground truncate">{l.counterparty}</div>
                  <div className="text-[11px] text-ink-muted truncate">
                    {l.direction === "lent" ? "Lent" : "Borrowed"} · {l.date}
                    {l.due_date && ` · due ${l.due_date}`}
                    {l.note && ` · ${l.note}`}
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <div className="font-serif text-lg text-foreground tabular-nums">
                    {getCurrencySymbol()}{formatINR(Number(l.amount))}
                  </div>
                  <div className="flex gap-1 justify-end mt-1">
                    {l.status === "open" && (
                      <button onClick={() => settle(l.id)} title="Mark settled"
                        className="text-emerald-600 hover:bg-emerald-500/10 p-1 rounded">
                        <Check className="h-3.5 w-3.5" />
                      </button>
                    )}
                    <button onClick={() => remove(l.id)} title="Delete"
                      className="text-ink-muted hover:text-destructive hover:bg-destructive/10 p-1 rounded">
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
}
