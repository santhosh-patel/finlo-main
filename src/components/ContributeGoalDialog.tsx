import { useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "@/hooks/use-toast";
import { getCurrencySymbol } from "@/lib/expenses";

interface GoalRow {
  id: string;
  title: string;
  current_amount: number;
  target_amount: number;
}

interface Props {
  goal: GoalRow | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onUpdated: () => void;
}

export function ContributeGoalDialog({ goal, open, onOpenChange, onUpdated }: Props) {
  const [amount, setAmount] = useState("");
  const [busy, setBusy] = useState(false);

  const handleContribute = async () => {
    if (!goal) return;
    const delta = Number(amount.replace(/,/g, ""));
    if (!Number.isFinite(delta) || delta <= 0) {
      toast({ title: "Invalid amount", description: "Enter a positive number.", variant: "destructive" });
      return;
    }

    setBusy(true);
    try {
      const next = Number(goal.current_amount) + delta;
      const { error } = await supabase
        .from("household_goals")
        .update({ current_amount: next, updated_at: new Date().toISOString() })
        .eq("id", goal.id);
      if (error) throw error;
      toast({ title: "Contribution saved", description: `Added ${getCurrencySymbol()}${delta} to ${goal.title}.` });
      setAmount("");
      onOpenChange(false);
      onUpdated();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not save contribution";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="rounded-2xl max-w-[320px]">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl font-normal">
            Add to {goal?.title ?? "goal"}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-3 py-2">
          <Label className="text-[10px] uppercase tracking-wider text-ink-muted">Amount</Label>
          <Input
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            inputMode="decimal"
            placeholder="1000"
            className="rounded-xl"
            autoFocus
          />
        </div>
        <DialogFooter className="gap-2">
          <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button className="rounded-full" onClick={() => void handleContribute()} disabled={busy || !goal}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
