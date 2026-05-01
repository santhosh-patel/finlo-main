import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
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
import { Button } from "@/components/ui/button";
import { Expense, formatINR, fullDateLabel } from "@/lib/expenses";
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";

interface Props {
  expense: Expense | null;
  onOpenChange: (open: boolean) => void;
  onEdit: (e: Expense) => void;
  onDelete: (id: string) => void;
}

export function ExpenseDetailsDrawer({ expense, onOpenChange, onEdit, onDelete }: Props) {
  const [confirmOpen, setConfirmOpen] = useState(false);
  const open = !!expense;

  return (
    <>
      <Sheet open={open} onOpenChange={onOpenChange}>
        <SheetContent
          side="bottom"
          className="bg-background border-border rounded-t-[32px] max-h-[80vh] overflow-y-auto"
        >
          {expense && (
            <>
              <SheetHeader className="text-left">
                <SheetTitle className="font-serif text-3xl font-normal text-foreground">
                  Entry
                </SheetTitle>
              </SheetHeader>

              <div className="mt-6 space-y-8 pb-6">
                <div className="bg-surface/60 rounded-3xl p-6 border border-border/40 text-center">
                  <div className="font-serif text-6xl text-foreground tabular-nums">
                    <span className="text-ink-muted/40 text-3xl mr-1">₹</span>
                    {formatINR(expense.amount)}
                  </div>
                  {expense.note && (
                    <p className="mt-3 text-foreground text-sm">{expense.note}</p>
                  )}
                </div>

                <dl className="space-y-4 text-sm">
                  <Row label="Category" value={expense.category} />
                  {expense.subcategory && (
                    <Row label="Subcategory" value={expense.subcategory} />
                  )}
                  <Row label="Date" value={fullDateLabel(expense.date)} />
                  <Row label="Payment" value={expense.payment_method.toUpperCase()} />
                </dl>

                <div className="grid grid-cols-2 gap-3">
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => onEdit(expense)}
                    className="rounded-full h-11"
                  >
                    <Pencil className="h-4 w-4 mr-1" /> Edit
                  </Button>
                  <Button
                    type="button"
                    variant="destructive"
                    onClick={() => setConfirmOpen(true)}
                    className="rounded-full h-11"
                  >
                    <Trash2 className="h-4 w-4 mr-1" /> Delete
                  </Button>
                </div>
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent className="bg-background border-border">
          <AlertDialogHeader>
            <AlertDialogTitle className="font-serif text-2xl font-normal">
              Delete this entry?
            </AlertDialogTitle>
            <AlertDialogDescription>
              {expense
                ? `₹${formatINR(expense.amount)} · ${expense.category}${
                    expense.note ? ` · ${expense.note}` : ""
                  }. This can't be undone.`
                : ""}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel className="rounded-full">Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="rounded-full bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                if (expense) {
                  onDelete(expense.id);
                  setConfirmOpen(false);
                  onOpenChange(false);
                }
              }}
            >
              Delete
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between items-baseline border-b border-border/40 pb-3">
      <dt className="text-[10px] tracking-[0.2em] uppercase text-ink-muted font-medium">
        {label}
      </dt>
      <dd className="text-foreground capitalize">{value}</dd>
    </div>
  );
}