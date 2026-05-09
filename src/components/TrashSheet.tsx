import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { Trash2, RotateCcw, AlertTriangle, Inbox } from "lucide-react";
import { useEffect, useState, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { formatINR, getCurrencySymbol, Expense } from "@/lib/expenses";
import { toast } from "@/hooks/use-toast";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string | null;
  onRestore: () => void;
}

export function TrashSheet({ open, onOpenChange, userId, onRestore }: Props) {
  const [deletedExpenses, setDeletedExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(false);
  const [permanentlyDeleting, setPermanentlyDeleting] = useState<Expense | null>(null);

  const fetchDeletedExpenses = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from("expenses")
        .select("*")
        .eq("user_id", userId)
        .not("deleted_at", "is", null)
        .order("deleted_at", { ascending: false });

      if (error) throw error;
      setDeletedExpenses((data as unknown as Expense[]) ?? []);
    } catch (e: unknown) {
      console.error("Failed to fetch deleted items:", e);
      toast({ title: "Failed to load Trash bin", description: (e as Error).message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (open && userId) {
      fetchDeletedExpenses();
    }
  }, [open, userId, fetchDeletedExpenses]);

  const handleRestore = async (id: string, name: string) => {
    try {
      const { error } = await supabase
        .from("expenses")
        .update({ deleted_at: null, client_updated_at: new Date().toISOString() })
        .eq("id", id);

      if (error) throw error;
      toast({ title: "Restored successfully", description: `"${name}" is back in your ledger.` });
      fetchDeletedExpenses();
      onRestore(); // trigger main ledger update
    } catch (e: unknown) {
      toast({ title: "Failed to restore", description: (e as Error).message, variant: "destructive" });
    }
  };

  const handlePermanentDelete = async () => {
    if (!permanentlyDeleting) return;
    const { id, note, category } = permanentlyDeleting;
    try {
      // 1. Delete matching loan row if existing
      await supabase.from("loans").delete().eq("expense_id", id);
      
      // 2. Permanent delete from expenses table
      const { error } = await supabase
        .from("expenses")
        .delete()
        .eq("id", id);

      if (error) throw error;
      toast({ title: "Permanently deleted", description: `"${note || category}" has been purged.` });
      setPermanentlyDeleting(null);
      fetchDeletedExpenses();
    } catch (e: unknown) {
      toast({ title: "Failed to delete permanently", description: (e as Error).message, variant: "destructive" });
    }
  };

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="right"
          className="bg-background border-border w-full sm:max-w-[480px] overflow-y-auto p-6"
        >
          <SheetHeader className="text-left mb-6">
            <SheetTitle className="font-serif text-3xl font-normal text-foreground">
              Trash Bin
            </SheetTitle>
            <p className="text-xs text-ink-muted">
              Items here were deleted in the last 30 days. Restoring them puts them back in your budget immediately.
            </p>
          </SheetHeader>

          {loading ? (
            <div className="flex justify-center py-12">
              <span className="text-sm text-ink-muted">Loading trash...</span>
            </div>
          ) : deletedExpenses.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 px-4 bg-surface/10 rounded-2xl border border-dashed border-border/30">
              <Inbox className="h-10 w-10 text-ink-muted/30 mb-3" />
              <p className="text-sm font-semibold text-foreground">Your trash is empty</p>
              <p className="text-xs text-ink-muted text-center mt-1">No recently deleted transactions found.</p>
            </div>
          ) : (
            <div className="space-y-3.5 pb-12">
              <p className="text-[10px] tracking-[0.2em] uppercase text-ink-muted font-semibold">
                Recently Deleted ({deletedExpenses.length})
              </p>
              <div className="divide-y divide-border/20 rounded-2xl border border-border/30 bg-surface/20 overflow-hidden">
                {deletedExpenses.map((e) => (
                  <div key={e.id} className="p-4 flex items-center justify-between gap-4 text-sm hover:bg-surface/30 transition-colors">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5">
                        <span className="font-semibold text-foreground truncate">{e.category}</span>
                        {e.subcategory && (
                          <span className="text-[10px] uppercase tracking-wider text-ink-muted bg-surface/50 px-1.5 py-0.5 rounded border border-border/20">
                            {e.subcategory}
                          </span>
                        )}
                      </div>
                      {e.note && <p className="text-xs text-ink-muted truncate mt-0.5">{e.note}</p>}
                      <p className="text-[10px] text-ink-muted/70 mt-1">
                        Deleted on {e.deleted_at ? new Date(e.deleted_at).toLocaleDateString() : "unknown"}
                      </p>
                    </div>
                    <div className="text-right shrink-0 flex items-center gap-3">
                      <div className="text-right mr-1">
                        <span className="font-serif text-sm font-medium text-foreground tabular-nums">
                          {getCurrencySymbol()}{formatINR(Number(e.amount))}
                        </span>
                        <p className="text-[9px] uppercase tracking-wider text-ink-muted mt-0.5">
                          {e.type || "expense"}
                        </p>
                      </div>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleRestore(e.id, e.note || e.category)}
                          className="h-8 w-8 rounded-lg flex items-center justify-center border border-border hover:border-foreground/20 text-ink-muted hover:text-foreground hover:bg-surface transition-all"
                          title="Restore"
                        >
                          <RotateCcw className="h-3.5 w-3.5" />
                        </button>
                        <button
                          onClick={() => setPermanentlyDeleting(e)}
                          className="h-8 w-8 rounded-lg flex items-center justify-center border border-destructive/20 hover:border-destructive/40 text-destructive/70 hover:text-destructive hover:bg-destructive/5 transition-all"
                          title="Delete permanently"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {/* Permanent Delete Confirmation */}
      <AlertDialog open={!!permanentlyDeleting} onOpenChange={(v) => !v && setPermanentlyDeleting(null)}>
        <AlertDialogContent className="bg-background border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-2xl font-normal flex items-center gap-2 text-destructive">
              <AlertTriangle className="h-5 w-5 shrink-0" /> Permanent Purge?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {permanentlyDeleting ? (
                <span>
                  Are you absolutely sure you want to permanently delete <strong>"{permanentlyDeleting.note || permanentlyDeleting.category}"</strong> for{" "}
                  <strong>
                    {getCurrencySymbol()}
                    {formatINR(Number(permanentlyDeleting.amount))}
                  </strong>
                  ? This will delete the transaction and any matching debt tracker entries forever. This action is irreversible.
                </span>
              ) : (
                ""
              )}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handlePermanentDelete}
              className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Purge Forever
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
