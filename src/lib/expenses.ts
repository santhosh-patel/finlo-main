export type PaymentMethod = "upi" | "cash" | "card";
export type TxnType = "expense" | "income";

export interface Expense {
  id: string;
  amount: number;
  category: string;
  subcategory?: string;
  note?: string;
  date: string; // ISO yyyy-mm-dd
  payment_method: PaymentMethod;
  created_at: string; // ISO datetime
  type?: TxnType; // defaults to "expense" when missing
  currency?: string; // ISO 4217, defaults to user base
  fx_rate?: number; // rate from `currency` to user base at time of entry
  base_amount?: number; // amount * fx_rate, in user base currency
  is_reimbursable?: boolean;
}

/** Returns the amount of the expense converted to the user's base currency. */
export function baseAmountOf(e: Expense): number {
  if (e.base_amount != null && !Number.isNaN(e.base_amount)) return Number(e.base_amount);
  const rate = e.fx_rate ?? 1;
  return Number(e.amount) * rate;
}


export interface CategoryDef {
  name: string;
  subcategories: string[];
  custom?: boolean;
  color?: string; // hex like #D1D8CA
  icon?: string;  // key from CATEGORY_ICONS
}

export const DEFAULT_CATEGORIES: CategoryDef[] = [
  { name: "Food", subcategories: ["dining", "delivery", "snacks"], icon: "Utensils", color: "#E3D3C2" },
  { name: "Groceries", subcategories: ["fruits", "staples", "household"], icon: "ShoppingBasket", color: "#D1D8CA" },
  { name: "Travel", subcategories: ["fuel", "metro", "cab", "flights"], icon: "Car", color: "#C8D6E5" },
  { name: "Bills", subcategories: ["electricity", "water", "wifi", "phone"], icon: "Plug", color: "#F1D6B7" },
  { name: "Shopping", subcategories: ["clothing", "electronics", "gifts"], icon: "ShoppingBag", color: "#E8C9D6" },
  { name: "Rent", subcategories: [], icon: "Home", color: "#D6CFE8" },
  { name: "Misc", subcategories: [], icon: "Wallet", color: "#E0DDD5" },
  { name: "Salon", subcategories: ["haircut", "spa"], icon: "Heart", color: "#F4C2C2" },
  { name: "Lending", subcategories: ["friends", "family"], icon: "PiggyBank", color: "#B8D8BA" },
  { name: "Hehe", subcategories: [], icon: "Film", color: "#FFD6A5" },
];

export const INCOME_CATEGORIES: CategoryDef[] = [
  { name: "Salary", subcategories: [], icon: "PiggyBank", color: "#B8D8BA" },
  { name: "Freelance", subcategories: [], icon: "Wallet", color: "#C8D6E5" },
  { name: "Refund", subcategories: [], icon: "ShoppingBag", color: "#E8C9D6" },
  { name: "Other Income", subcategories: [], icon: "Heart", color: "#FFD6A5" },
];

export const PAYMENT_METHODS: { value: PaymentMethod; label: string }[] = [
  { value: "upi", label: "UPI" },
  { value: "cash", label: "Cash" },
  { value: "card", label: "Card" },
];

export function getCurrencySymbol(): string {
  try {
    const raw = localStorage.getItem("finlo.theme.v1");
    if (raw) {
      const theme = JSON.parse(raw);
      if (theme.currencySymbol) return theme.currencySymbol;
    }
  } catch {}
  return "₹";
}

export function formatINR(n: number): string {
  let locale = "en-IN";
  try {
    const raw = localStorage.getItem("finlo.theme.v1");
    if (raw) {
      const theme = JSON.parse(raw);
      if (theme.currency === "USD") locale = "en-US";
      else if (theme.currency === "EUR") locale = "de-DE";
      else if (theme.currency === "GBP") locale = "en-GB";
    }
  } catch {}
  return new Intl.NumberFormat(locale, {
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

export function addDays(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function weekRangeOf(iso: string): { from: string; to: string; label: string } {
  const d = new Date(iso + "T00:00:00");
  const day = d.getDay();
  const diff = (day + 6) % 7;
  const from = new Date(d); from.setDate(d.getDate() - diff);
  const to = new Date(from); to.setDate(from.getDate() + 6);
  const sameMonth = from.getMonth() === to.getMonth();
  const label = sameMonth
    ? `${from.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${to.getDate()}, ${to.getFullYear()}`
    : `${from.toLocaleDateString("en-US", { month: "short", day: "numeric" })} – ${to.toLocaleDateString("en-US", { month: "short", day: "numeric" })}, ${to.getFullYear()}`;
  return { from: isoDate(from), to: isoDate(to), label };
}

export function monthRangeOf(iso: string): { from: string; to: string; label: string } {
  const d = new Date(iso + "T00:00:00");
  const from = new Date(d.getFullYear(), d.getMonth(), 1);
  const to = new Date(d.getFullYear(), d.getMonth() + 1, 0);
  return {
    from: isoDate(from),
    to: isoDate(to),
    label: from.toLocaleDateString("en-US", { month: "long", year: "numeric" }),
  };
}

export function shiftWeek(iso: string, n: number): string {
  return addDays(iso, n * 7);
}
export function shiftMonth(iso: string, n: number): string {
  const d = new Date(iso + "T00:00:00");
  d.setMonth(d.getMonth() + n);
  return isoDate(d);
}

export function dayLabelRich(iso: string): string {
  const today = todayISO();
  if (iso === today) return "Today";
  if (iso === addDays(today, -1)) return "Yesterday";
  if (iso === addDays(today, -2)) {
    return new Date(iso + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" });
  }
  return fullDateLabel(iso);
}

export function rangeDays(from: string, to: string): string[] {
  const out: string[] = [];
  let cur = from;
  while (cur <= to) { out.push(cur); cur = addDays(cur, 1); }
  return out;
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