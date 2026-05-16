import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { formatINR, getCurrencySymbol, todayISO } from "@/lib/expenses";
import { ArrowDownLeft, ArrowLeft, ArrowUpRight, Check, Loader2, Plus, RotateCcw, Trash2 } from "lucide-react";
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
  interest_rate: number;
  interest_type: "none" | "flat" | "simple" | "compound";
}

export interface LoanPayment {
  id: string;
  loan_id: string;
  user_id: string;
  amount: number;
  date: string;
  note: string | null;
  type: "principal" | "interest";
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
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState({
    counterparty: "",
    amount: "",
    direction: "lent" as "lent" | "borrowed",
    date: todayISO(),
    due_date: "",
    note: "",
    interest_rate: "0",
    interest_type: "none" as "none" | "flat" | "simple" | "compound",
  });

  const [payments, setPayments] = useState<Record<string, LoanPayment[]>>({});
  const [showPaymentForm, setShowPaymentForm] = useState<string | null>(null);
  const [paymentDraft, setPaymentDraft] = useState({ amount: "", date: todayISO(), note: "", type: "principal" as "principal" | "interest" });

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
    setLoans((data ?? []) as Loan[]);

    // Load payments for all loans
    if (data && data.length > 0) {
      const { data: pData } = await supabase
        .from("loan_payments")
        .select("*")
        .in("loan_id", data.map(l => l.id));
      
      const pMap: Record<string, LoanPayment[]> = {};
      (pData as any[] ?? []).forEach((p: LoanPayment) => {
        if (!pMap[p.loan_id]) pMap[p.loan_id] = [];
        pMap[p.loan_id].push(p);
      });
      setPayments(pMap);
    }
  }, [userId]);

  useEffect(() => { if (open) load(); }, [open, load]);

  const reset = () => setDraft({ counterparty: "", amount: "", direction: "lent", date: todayISO(), due_date: "", note: "", interest_rate: "0", interest_type: "none" });

  const save = async () => {
    if (!userId || saving) return;
    const amt = parseFloat(draft.amount);
    if (!draft.counterparty.trim() || !amt || amt <= 0) {
      toast({ title: "Missing fields", description: "Person and amount required.", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("loans").insert({
      user_id: userId,
      counterparty: draft.counterparty.trim(),
      amount: amt,
      direction: draft.direction,
      date: draft.date,
      due_date: draft.due_date || null,
      note: draft.note.trim() || null,
      interest_rate: parseFloat(draft.interest_rate) || 0,
      interest_type: draft.interest_type,
    });
    setSaving(false);
    if (error) { toast({ title: "Save failed", description: error.message, variant: "destructive" }); return; }
    toast({ title: "Loan added" });
    reset(); setShowForm(false); load();
  };

  const recordPayment = async (loanId: string) => {
    if (!userId || saving) return;
    const amt = parseFloat(paymentDraft.amount);
    if (!amt || amt <= 0) {
      toast({ title: "Enter valid amount", variant: "destructive" });
      return;
    }
    setSaving(true);
    const { error } = await supabase.from("loan_payments").insert({
      loan_id: loanId,
      user_id: userId,
      amount: amt,
      date: paymentDraft.date,
      note: paymentDraft.note.trim() || null,
      type: paymentDraft.type,
    });
    setSaving(false);
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    
    // Check if fully paid
    const loan = loans.find(l => l.id === loanId);
    if (loan) {
      const existingPaid = (payments[loanId] ?? []).reduce((a, b) => b.type === "principal" ? a + b.amount : a, 0);
      const totalPaid = existingPaid + (paymentDraft.type === "principal" ? amt : 0);
      if (totalPaid >= loan.amount) {
        await supabase.from("loans").update({ status: "settled" }).eq("id", loanId);
      }
    }

    toast({ title: "Payment recorded" });
    setShowPaymentForm(null);
    setPaymentDraft({ amount: "", date: todayISO(), note: "", type: "principal" });
    load();
  };

  const settle = async (id: string) => {
    const { error } = await supabase.from("loans").update({ status: "settled" }).eq("id", id);
    if (error) { toast({ title: "Failed", description: error.message, variant: "destructive" }); return; }
    load();
  };

  const reopen = async (id: string) => {
    const { error } = await supabase.from("loans").update({ status: "open" }).eq("id", id);
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
      <SheetContent
        side="right"
        hideCloseButton
        className="bg-background border-border w-full sm:max-w-[520px] overflow-y-auto p-6 max-md:pb-[var(--finlo-mobile-tab-clearance)] pt-[calc(1.5rem+env(safe-area-inset-top,0px))]"
      >
        <div className="flex items-start gap-2 mb-6">
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="shrink-0 rounded-full -ml-2 -mt-1 h-10 w-10"
            onClick={() => onOpenChange(false)}
            aria-label="Back"
          >
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <SheetHeader className="text-left space-y-1 flex-1 p-0">
            <SheetTitle className="font-serif text-2xl sm:text-3xl font-normal text-foreground">Lending</SheetTitle>
            <p className="text-xs text-ink-muted">Track money you've lent out or borrowed.</p>
          </SheetHeader>
        </div>

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
            <div className="grid grid-cols-2 gap-3">
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-ink-muted">Interest Rate (%)</Label>
                <Input type="number" value={draft.interest_rate} onChange={(e) => setDraft((s) => ({ ...s, interest_rate: e.target.value }))}
                  placeholder="0" className="mt-1 rounded-full bg-background" />
              </div>
              <div>
                <Label className="text-[10px] uppercase tracking-wider text-ink-muted">Type</Label>
                <Select value={draft.interest_type} onValueChange={(v: any) => setDraft((s) => ({ ...s, interest_type: v }))}>
                  <SelectTrigger className="mt-1 rounded-full bg-background"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">None</SelectItem>
                    <SelectItem value="flat">Flat</SelectItem>
                    <SelectItem value="simple">Simple</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex gap-2 pt-2">
              <Button onClick={save} disabled={saving} className="flex-1 rounded-full disabled:opacity-60">{saving ? "Saving…" : "Save"}</Button>
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
            {loans.map((l) => {
              const loanPayments = payments[l.id] ?? [];
              const paidPrincipal = loanPayments.reduce((a, b) => b.type === "principal" ? a + b.amount : a, 0);
              const remaining = l.amount - paidPrincipal;
              const progress = Math.min(100, (paidPrincipal / l.amount) * 100);

              return (
                <li key={l.id} className="space-y-2">
                  <div className={cn(
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
                        {l.interest_rate > 0 && ` · ${l.interest_rate}% ${l.interest_type}`}
                      </div>
                      {l.status === "open" && (
                        <div className="mt-2 w-full bg-surface/50 h-1 rounded-full overflow-hidden">
                          <div className="bg-emerald-500 h-full transition-all" style={{ width: `${progress}%` }} />
                        </div>
                      )}
                    </div>
                    <div className="text-right shrink-0">
                      <div className="font-serif text-lg text-foreground tabular-nums">
                        {getCurrencySymbol()}{formatINR(remaining > 0 ? remaining : Number(l.amount))}
                      </div>
                      <div className="flex gap-1 justify-end mt-1">
                        {l.status === "open" ? (
                          <>
                            <button onClick={() => setShowPaymentForm(showPaymentForm === l.id ? null : l.id)} 
                              title="Record payment" className="text-foreground hover:bg-surface p-1 rounded">
                              <Plus className="h-3.5 w-3.5" />
                            </button>
                            <button onClick={() => settle(l.id)} title="Mark settled"
                              className="text-emerald-600 hover:bg-emerald-500/10 p-1 rounded">
                              <Check className="h-3.5 w-3.5" />
                            </button>
                          </>
                        ) : (
                          <button onClick={() => reopen(l.id)} title="Reopen loan"
                            className="text-ink-muted hover:text-foreground hover:bg-surface p-1 rounded">
                            <RotateCcw className="h-3.5 w-3.5" />
                          </button>
                        )}
                        <button onClick={() => remove(l.id)} title="Delete"
                          className="text-ink-muted hover:text-destructive hover:bg-destructive/10 p-1 rounded">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>

                  {showPaymentForm === l.id && (
                    <div className="ml-4 p-3 rounded-2xl bg-surface/30 border border-border/20 space-y-3 animate-in fade-in slide-in-from-top-2">
                      <p className="text-[10px] uppercase tracking-widest text-ink-muted font-bold">Record Payment</p>
                      <div className="grid grid-cols-2 gap-2">
                        <Input type="number" placeholder="Amount" value={paymentDraft.amount} 
                          onChange={e => setPaymentDraft({...paymentDraft, amount: e.target.value})}
                          className="h-8 rounded-full bg-background" />
                        <Select value={paymentDraft.type} onValueChange={(v: any) => setPaymentDraft({...paymentDraft, type: v})}>
                          <SelectTrigger className="h-8 rounded-full bg-background text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="principal">Principal</SelectItem>
                            <SelectItem value="interest">Interest</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <Button size="sm" onClick={() => recordPayment(l.id)} disabled={saving} className="w-full rounded-full h-8">
                        {saving ? "Saving..." : "Confirm Payment"}
                      </Button>
                    </div>
                  )}

                  {loanPayments.length > 0 && (
                    <div className="ml-12 space-y-1">
                      {loanPayments.map(p => (
                        <div key={p.id} className="text-[10px] text-ink-muted flex justify-between border-l border-border/20 pl-3">
                          <span>{p.date} · {p.type}</span>
                          <span>{getCurrencySymbol()}{formatINR(p.amount)}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </SheetContent>
    </Sheet>
  );
}
