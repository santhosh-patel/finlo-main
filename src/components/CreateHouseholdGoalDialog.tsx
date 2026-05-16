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

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  householdId: string;
  onCreated: () => void;
}

export function CreateHouseholdGoalDialog({ open, onOpenChange, householdId, onCreated }: Props) {
  const [title, setTitle] = useState("");
  const [target, setTarget] = useState("");
  const [deadline, setDeadline] = useState("");
  const [busy, setBusy] = useState(false);

  const reset = () => {
    setTitle("");
    setTarget("");
    setDeadline("");
  };

  const handleCreate = async () => {
    const trimmedTitle = title.trim();
    const targetAmount = Number(target.replace(/,/g, ""));
    if (!trimmedTitle) {
      toast({ title: "Name required", description: "Give your goal a name.", variant: "destructive" });
      return;
    }
    if (!Number.isFinite(targetAmount) || targetAmount <= 0) {
      toast({ title: "Invalid target", description: "Enter a positive amount.", variant: "destructive" });
      return;
    }

    setBusy(true);
    try {
      const { error } = await supabase.from("household_goals").insert({
        household_id: householdId,
        title: trimmedTitle,
        target_amount: targetAmount,
        current_amount: 0,
        deadline: deadline || null,
        color: "primary",
      });
      if (error) throw error;
      toast({ title: "Goal created", description: `"${trimmedTitle}" is ready to track.` });
      reset();
      onOpenChange(false);
      onCreated();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : "Could not create goal";
      toast({ title: "Error", description: message, variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        if (!v) reset();
        onOpenChange(v);
      }}
    >
      <DialogContent className="rounded-2xl max-w-[340px]">
        <DialogHeader>
          <DialogTitle className="font-serif text-xl font-normal">New shared goal</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-ink-muted">Goal name</Label>
            <Input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Vacation fund"
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-ink-muted">Target amount</Label>
            <Input
              value={target}
              onChange={(e) => setTarget(e.target.value)}
              inputMode="decimal"
              placeholder="50000"
              className="rounded-xl"
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-[10px] uppercase tracking-wider text-ink-muted">Deadline (optional)</Label>
            <Input
              type="date"
              value={deadline}
              onChange={(e) => setDeadline(e.target.value)}
              className="rounded-xl"
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:gap-2">
          <Button variant="outline" className="rounded-full" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button className="rounded-full" onClick={() => void handleCreate()} disabled={busy}>
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create goal"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
