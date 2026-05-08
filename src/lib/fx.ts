// Lightweight FX rate cache. Rates are quote-per-1-base.
// Source: exchangerate.host (no key, free). Falls back to static rates.

const FX_KEY = "finlo.fx.v1";
const STATIC_RATES: Record<string, Record<string, number>> = {
  INR: { INR: 1, USD: 0.012, EUR: 0.011, GBP: 0.0094, AED: 0.044, SGD: 0.016, JPY: 1.86, CAD: 0.016, AUD: 0.018 },
  USD: { USD: 1, INR: 83.3, EUR: 0.92, GBP: 0.78, AED: 3.67, SGD: 1.34, JPY: 155, CAD: 1.36, AUD: 1.51 },
  EUR: { EUR: 1, INR: 90.3, USD: 1.08, GBP: 0.85, AED: 3.97, SGD: 1.45, JPY: 168, CAD: 1.47, AUD: 1.63 },
  GBP: { GBP: 1, INR: 106, USD: 1.27, EUR: 1.17, AED: 4.66, SGD: 1.71, JPY: 197, CAD: 1.73, AUD: 1.92 },
};

export const SUPPORTED_CURRENCIES = ["INR", "USD", "EUR", "GBP", "AED", "SGD", "JPY", "CAD", "AUD"] as const;
export type CurrencyCode = (typeof SUPPORTED_CURRENCIES)[number];

export const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: "₹", USD: "$", EUR: "€", GBP: "£", AED: "د.إ", SGD: "S$", JPY: "¥", CAD: "C$", AUD: "A$",
};

interface FXCache { date: string; base: string; rates: Record<string, number> }

function readCache(): FXCache | null {
  try { const raw = localStorage.getItem(FX_KEY); return raw ? JSON.parse(raw) : null; } catch { return null; }
}
function writeCache(c: FXCache) { try { localStorage.setItem(FX_KEY, JSON.stringify(c)); } catch {} }

function todayStr() { return new Date().toISOString().slice(0, 10); }

export function getBaseCurrency(): string {
  try {
    const raw = localStorage.getItem("finlo.theme.v1");
    if (raw) {
      const t = JSON.parse(raw);
      if (t.currency) return t.currency;
    }
  } catch {
    // Fallback to default if parsing fails
  }
  return "INR";
}

/** Sync FX rate (cached, may be stale). 1 unit of `from` → x units of `to`. */
export function getFxRateSync(from: string, to: string): number {
  if (from === to) return 1;
  const cache = readCache();
  if (cache && cache.base === from && cache.rates[to]) return cache.rates[to];
  const s = STATIC_RATES[from]?.[to];
  if (s) return s;
  const inv = STATIC_RATES[to]?.[from];
  if (inv) return 1 / inv;
  // Cross via USD
  const a = STATIC_RATES[from]?.USD ?? 1;
  const b = STATIC_RATES.USD?.[to] ?? 1;
  return a * b;
}

/** Refresh today's rates for the given base currency. Best-effort. */
export async function refreshFxRates(base: string): Promise<void> {
  const cache = readCache();
  if (cache && cache.base === base && cache.date === todayStr()) return;
  try {
    const res = await fetch(`https://api.exchangerate.host/latest?base=${base}&symbols=${SUPPORTED_CURRENCIES.join(",")}`);
    if (!res.ok) throw new Error("fx fetch failed");
    const json = await res.json();
    if (json && json.rates) {
      writeCache({ date: todayStr(), base, rates: json.rates });
    }
  } catch {
    // keep stale cache or fall through to static rates
  }
}
