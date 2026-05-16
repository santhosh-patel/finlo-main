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
  /** Short context for splits / reimbursement (e.g. who owes) */
  split_note?: string;
  reimbursed_at?: string | null;
  client_updated_at?: string;
  import_hash?: string;
  receipt_url?: string;
  deleted_at?: string;
  user_id: string;
  household_id?: string | null;
  reactions?: { user_id: string; emoji: string }[];
}

/** Payload for creating a new expense - ID and user ID are handled by the hook/server */
export type ExpensePayload = Omit<Expense, "id" | "created_at" | "user_id">;

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
  type?: "expense" | "income";
}

export const DEFAULT_CATEGORIES: CategoryDef[] = [
  { name: "Food", subcategories: ["dining", "delivery", "snacks"], icon: "Utensils", color: "#E3D3C2", type: "expense" },
  { name: "Groceries", subcategories: ["fruits", "staples", "household"], icon: "ShoppingBasket", color: "#D1D8CA", type: "expense" },
  { name: "Travel", subcategories: ["fuel", "metro", "cab", "flights"], icon: "Car", color: "#C8D6E5", type: "expense" },
  { name: "Bills", subcategories: ["electricity", "water", "wifi", "phone"], icon: "Plug", color: "#F1D6B7", type: "expense" },
  { name: "Shopping", subcategories: ["clothing", "electronics", "gifts"], icon: "ShoppingBag", color: "#E8C9D6", type: "expense" },
  { name: "Rent", subcategories: [], icon: "Home", color: "#D6CFE8", type: "expense" },
  { name: "Misc", subcategories: [], icon: "Wallet", color: "#E0DDD5", type: "expense" },
  { name: "Salon", subcategories: ["haircut", "spa"], icon: "Heart", color: "#F4C2C2", type: "expense" },
  { name: "Lending", subcategories: ["friends", "family"], icon: "PiggyBank", color: "#B8D8BA", type: "expense" },
  { name: "Hehe", subcategories: [], icon: "Film", color: "#FFD6A5", type: "expense" },
  
  // Income categories
  { name: "Salary", subcategories: [], icon: "PiggyBank", color: "#B8D8BA", type: "income" },
  { name: "Freelance", subcategories: [], icon: "Wallet", color: "#C8D6E5", type: "income" },
  { name: "Refund", subcategories: [], icon: "ShoppingBag", color: "#E8C9D6", type: "income" },
  { name: "Other Income", subcategories: [], icon: "Heart", color: "#FFD6A5", type: "income" },
];

export const INCOME_CATEGORIES: CategoryDef[] = DEFAULT_CATEGORIES.filter(c => c.type === "income");

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
  } catch (err) {
    // Fallback to default symbol on error or missing config
  }
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
  } catch (err) {
    // Fallback to default locale on error
  }
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

const YMD_ONLY = /^\d{4}-\d{2}-\d{2}$/;

/**
 * Normalize DB (timestamptz) or UI strings to a calendar yyyy-mm-dd in the user's local timezone.
 * Plain yyyy-mm-dd is returned unchanged — do not parse it as UTC midnight.
 */
export function normalizeExpenseDate(value: string): string {
  const trimmed = (value ?? "").trim();
  if (!trimmed) return "";
  if (YMD_ONLY.test(trimmed)) return trimmed;
  const d = new Date(trimmed);
  if (Number.isNaN(d.getTime())) {
    const i = trimmed.indexOf("T");
    return i > 0 ? trimmed.slice(0, i) : trimmed.slice(0, 10);
  }
  return isoDate(d);
}

/**
 * Persist a ledger calendar day in `expenses.date` (timestamptz). Noon UTC keeps the UTC date aligned
 * with the chosen day so reads are stable; midnight local/UTC would otherwise shift the calendar day.
 */
export function expenseDateToDbIso(value: string): string {
  const ymd = normalizeExpenseDate(value);
  if (!YMD_ONLY.test(ymd)) return `${todayISO()}T12:00:00.000Z`;
  return `${ymd}T12:00:00.000Z`;
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

function cleanISO(iso: string): string {
  if (!iso) return "";
  return iso.split("T")[0];
}

export function dayLabel(iso: string): string {
  const d = new Date(cleanISO(iso) + "T00:00:00");
  return d.toLocaleDateString("en-US", { weekday: "short" });
}

export function fullDateLabel(iso: string): string {
  const d = new Date(cleanISO(iso) + "T00:00:00");
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
  const d = new Date(cleanISO(iso) + "T00:00:00");
  d.setDate(d.getDate() + n);
  return isoDate(d);
}

export function weekRangeOf(iso: string): { from: string; to: string; label: string } {
  const d = new Date(cleanISO(iso) + "T00:00:00");
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
  const d = new Date(cleanISO(iso) + "T00:00:00");
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
  const d = new Date(cleanISO(iso) + "T00:00:00");
  d.setMonth(d.getMonth() + n);
  return isoDate(d);
}

export function dayLabelRich(iso: string): string {
  const today = todayISO();
  const cleaned = cleanISO(iso);
  if (cleaned === today) return "Today";
  if (cleaned === addDays(today, -1)) return "Yesterday";
  if (cleaned === addDays(today, -2)) {
    return new Date(cleaned + "T00:00:00").toLocaleDateString("en-US", { weekday: "long" });
  }
  return fullDateLabel(cleaned);
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