// Processes recurring expense rules: creates expenses for rules due today
// and advances next_due_date. Idempotent per (rule, date).
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

function advance(current: string, frequency: string, dayOfMonth?: number | null): string {
  const d = new Date(current + "T00:00:00");
  if (frequency === "weekly") {
    d.setDate(d.getDate() + 7);
  } else {
    // monthly
    const target = dayOfMonth ?? d.getDate();
    d.setMonth(d.getMonth() + 1);
    // clamp day to last day of month
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(target, lastDay));
  }
  return isoDate(d);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const today = isoDate(new Date());
  const { data: due, error } = await supabase
    .from("recurring_expenses")
    .select("*")
    .eq("active", true)
    .lte("next_due_date", today);

  if (error) {
    return new Response(JSON.stringify({ ok: false, error: error.message }), {
      status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  let created = 0;
  const results: Array<{ id: string; created: number; next: string }> = [];

  for (const rule of due ?? []) {
    let next = rule.next_due_date as string;
    let last = rule.last_run_date as string | null;
    let localCreated = 0;
    // Catch up if behind (e.g. cron didn't run for several days)
    while (next <= today) {
      // Skip if already created on this date for this rule
      if (last !== next) {
        const { error: insErr } = await supabase.from("expenses").insert({
          user_id: rule.user_id,
          amount: rule.amount,
          category: rule.category,
          subcategory: rule.subcategory,
          note: rule.note ? `${rule.note} (recurring)` : "Recurring",
          date: next,
          payment_method: rule.payment_method,
        });
        if (!insErr) { created += 1; localCreated += 1; last = next; }
      }
      next = advance(next, rule.frequency, rule.day_of_month);
      // safety: avoid runaway loops
      if (localCreated > 60) break;
    }
    await supabase.from("recurring_expenses").update({
      next_due_date: next,
      last_run_date: last,
    }).eq("id", rule.id);
    results.push({ id: rule.id, created: localCreated, next });
  }

  return new Response(JSON.stringify({ ok: true, created, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
