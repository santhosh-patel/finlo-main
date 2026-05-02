export type PaymentMethod = "upi" | "cash" | "card";

export interface Expense {
  id: string;
  amount: number;
  category: string;
  subcategory?: string;
  note?: string;
  date: string; // ISO yyyy-mm-dd
  payment_method: PaymentMethod;
  created_at: string; // ISO datetime
}

export interface CategoryDef {
  name: string;
  subcategories: string[];
  custom?: boolean;
}

export const DEFAULT_CATEGORIES: CategoryDef[] = [
  { name: "Food", subcategories: ["dining", "delivery", "snacks"] },
  { name: "Groceries", subcategories: ["fruits", "staples", "household"] },
  { name: "Travel", subcategories: ["fuel", "metro", "cab", "flights"] },
  { name: "Bills", subcategories: ["electricity", "water", "wifi", "phone"] },
  { name: "Shopping", subcategories: ["clothing", "electronics", "gifts"] },
  { name: "Rent", subcategories: [] },
  { name: "Misc", subcategories: [] },
];

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "upi", label: "UPI" },
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
];

export function formatINR(n: number): string {
  return new Intl.NumberFormat("en-IN", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(n);
}

export function todayISO(): string {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export function startOfMonthISO(): string {
  const d = new Date();
  return isoDate(new Date(d.getFullYear(), d.getMonth(), 1));
}

export function lastNDays(n: number): string[] {
  const out: string[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    out.push(isoDate(d));
  }
  return out;
}

export function dayLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

export function fullDateLabel(iso: string): string {
  const d = new Date(iso + "T00:00:00");
  return d.toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
}

export function startOfWeekISO(): string {
  const d = new Date();
  const day = d.getDay(); // 0 = Sun
  const diff = (day + 6) % 7; // make Monday start
  d.setDate(d.getDate() - diff);
  return isoDate(d);
}

function csvEscape(v: string): string {
  if (v == null) return "";
  const needs = /[",\n\r]/.test(v);
  const s = v.replace(/"/g, '""');
  return needs ? `"${s}"` : s;
}

export function expensesToCSV(rows: Expense[]): string {
  const header = ["Date", "Amount", "Category", "Subcategory", "Note", "Payment"];
  const lines = [header.join(",")];
  for (const e of rows) {
    lines.push(
      [
        e.date,
        e.amount.toFixed(2),
        csvEscape(e.category),
        csvEscape(e.subcategory ?? ""),
        csvEscape(e.note ?? ""),
        e.payment_method,
      ].join(",")
    );
  }
  return lines.join("\n");
}

export function downloadCSV(filename: string, content: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}