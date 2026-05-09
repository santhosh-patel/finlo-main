import { useRef, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { getCurrencySymbol, Expense, PaymentMethod, todayISO } from "@/lib/expenses";
import { Upload, FileWarning, CheckCircle2 } from "lucide-react";

type XlsxNs = typeof import("xlsx");

type Row = Omit<Expense, "id" | "created_at">;

interface Props {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onImport: (rows: Row[]) => { imported: number; skippedDuplicates: number };
}

function normalizeKey(k: string): string {
  return k.toLowerCase().replace(/[^a-z]/g, "");
}

function parseDate(v: unknown): string | null {
  if (!v && v !== 0) return null;
  if (v instanceof Date) {
    const y = v.getFullYear();
    if (Number.isNaN(y)) return null;
    return `${y}-${String(v.getMonth() + 1).padStart(2, "0")}-${String(v.getDate()).padStart(2, "0")}`;
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  const d = new Date(s);
  if (Number.isNaN(d.getTime())) return null;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

function parseAmount(v: unknown): number | null {
  if (v === undefined || v === null || v === "") return null;
  const n = typeof v === "number" ? v : parseFloat(String(v).replace(/[^\d.-]/g, ""));
  if (!Number.isFinite(n) || n <= 0) return null;
  return n;
}

function parsePayment(v: unknown): PaymentMethod {
  const s = String(v ?? "").trim().toLowerCase();
  if (s === "cash") return "cash";
  if (s === "card") return "card";
  return "upi";
}

async function computeHash(date: string, amount: number, category: string, note?: string): Promise<string> {
  const message = `${date}|${amount.toFixed(2)}|${category.toLowerCase()}|${(note || "").toLowerCase()}`;
  const msgBuffer = new TextEncoder().encode(message);
  const hashBuffer = await crypto.subtle.digest("SHA-256", msgBuffer);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

export function ImportSheet({ open, onOpenChange, onImport }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [skipped, setSkipped] = useState(0);
  const [filename, setFilename] = useState("");
  const [imported, setImported] = useState(0);
  const [duplicates, setDuplicates] = useState(0);

  const handleFile = async (file: File) => {
    setImported(0);
    setDuplicates(0);
    setFilename(file.name);
    const mod = await import("xlsx");
    const XLSX = ("default" in mod && mod.default && typeof mod.default.read === "function"
      ? mod.default
      : mod) as XlsxNs;
    const buf = await file.arrayBuffer();
    const wb = XLSX.read(buf, { type: "array", cellDates: true });
    const sheet = wb.Sheets[wb.SheetNames[0]];
    const json = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: "" });

    const parsed: Row[] = [];
    let bad = 0;
    
    const jobs = json.map(async (raw) => {
      const map: Record<string, unknown> = {};
      Object.entries(raw).forEach(([k, v]) => { map[normalizeKey(k)] = v; });
      const date = parseDate(map.date);
      const amount = parseAmount(map.amount);
      const category = String(map.category ?? "").trim();
      if (!date || !amount || !category) { bad++; return; }
      
      const hash = await computeHash(date, amount, category, String(map.note ?? "").trim());
      parsed.push({
        date,
        amount,
        category,
        subcategory: String(map.subcategory ?? "").trim() || undefined,
        note: String(map.note ?? "").trim() || undefined,
        payment_method: parsePayment(map.payment ?? map.paymentmethod),
        import_hash: hash,
      });
    });

    await Promise.all(jobs);
    setRows(parsed);
    setSkipped(bad);
  };

  const doImport = () => {
    const res = onImport(rows);
    setImported(res.imported);
    setDuplicates(res.skippedDuplicates);
    setRows([]);
    setSkipped(0);
    if (inputRef.current) inputRef.current.value = "";
  };

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent
        side="bottom"
        className="bg-background border-border rounded-t-[32px] max-h-[88vh] overflow-y-auto"
      >
        <SheetHeader className="text-left">
          <SheetTitle className="font-serif text-3xl font-normal text-foreground">
            Import expenses
          </SheetTitle>
          <p className="text-xs text-ink-muted">
            Upload a CSV or Excel file. Required columns: <span className="text-foreground">Date, Amount, Category</span>. Optional: Subcategory, Note, Payment.
          </p>
        </SheetHeader>

        <div className="mt-6 space-y-6 pb-8">
          <label className="block">
            <input
              ref={inputRef}
              type="file"
              accept=".csv,.xlsx,.xls"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) handleFile(f);
              }}
              className="hidden"
            />
            <div className="border-2 border-dashed border-border rounded-3xl p-8 text-center hover:bg-surface/40 cursor-pointer transition-colors">
              <Upload className="h-8 w-8 mx-auto text-ink-muted mb-2" />
              <p className="text-sm text-foreground">Choose a file</p>
              <p className="text-xs text-ink-muted mt-1">{filename || ".csv, .xlsx, .xls"}</p>
            </div>
          </label>

          {(imported > 0 || duplicates > 0) && (
            <div className="rounded-2xl border border-border/40 bg-wash-sage/30 p-4 flex flex-col gap-1">
              <div className="flex items-center gap-3">
                <CheckCircle2 className="h-5 w-5 text-foreground shrink-0" />
                <div>
                  {imported > 0 && (
                    <p className="text-sm font-semibold text-foreground">
                      Successfully imported {imported} transaction{imported === 1 ? "" : "s"}.
                    </p>
                  )}
                  {duplicates > 0 && (
                    <p className="text-xs text-ink-muted mt-0.5">
                      Skipped {duplicates} duplicate transaction{duplicates === 1 ? "" : "s"} silently.
                    </p>
                  )}
                </div>
              </div>
            </div>
          )}

          {rows.length > 0 && (
            <>
              <div className="rounded-2xl border border-border/40 p-4 space-y-2">
                <div className="flex items-baseline justify-between">
                  <span className="text-[10px] tracking-[0.2em] uppercase text-ink-muted">Preview</span>
                  <span className="text-xs text-ink-muted">{rows.length} valid · {skipped} skipped</span>
                </div>
                <div className="max-h-64 overflow-y-auto divide-y divide-border/40">
                  {rows.slice(0, 50).map((r, i) => (
                    <div key={i} className="py-2 flex justify-between text-xs">
                      <span className="text-foreground">{r.date} · {r.category}{r.note ? ` · ${r.note}` : ""}</span>
                      <span className="tabular-nums text-foreground">{getCurrencySymbol()}{r.amount.toFixed(2)}</span>
                    </div>
                  ))}
                  {rows.length > 50 && (
                    <p className="text-[11px] text-ink-muted py-2 text-center">…and {rows.length - 50} more</p>
                  )}
                </div>
              </div>
              {skipped > 0 && (
                <p className="text-xs text-ink-muted flex items-center gap-1.5">
                  <FileWarning className="h-3.5 w-3.5" /> {skipped} row{skipped === 1 ? "" : "s"} skipped (missing date, amount, or category).
                </p>
              )}
              <Button
                type="button"
                onClick={doImport}
                size="lg"
                className="w-full rounded-full bg-foreground text-background hover:bg-foreground/90 h-12 text-base font-medium"
              >
                Import {rows.length} expense{rows.length === 1 ? "" : "s"}
              </Button>
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}