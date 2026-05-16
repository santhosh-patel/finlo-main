// Creates expenses for recurring rules due today. Either: (a) CRON_SECRET in x-cron-header for full run, or (b) user JWT processes that user's rules only.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getCorsHeaders, jsonResponse } from "../_shared/cors.ts";

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
    const target = dayOfMonth ?? d.getDate();
    d.setMonth(d.getMonth() + 1);
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(target, lastDay));
  }
  return isoDate(d);
}

async function processRules(
  supabase: ReturnType<typeof createClient>,
  rules: Record<string, unknown>[],
): Promise<{ created: number; results: Array<{ id: string; created: number; next: string }> }> {
  const today = isoDate(new Date());
  let created = 0;
  const results: Array<{ id: string; created: number; next: string }> = [];

  for (const rule of rules) {
    const id = rule.id as string;
    let next = rule.next_due_date as string;
    let last = rule.last_run_date as string | null;
    let localCreated = 0;
    while (next <= today) {
      if (last !== next) {
        const category = String(rule.category ?? "");
        const isIncome =
          ["salary", "freelance", "refund", "other income"].includes(category.toLowerCase()) ||
          category.toLowerCase().includes("income");
        
        // Instead of direct insert, we create a pulse for confirmation
        const { error: pulseErr } = await supabase.from("daily_pulses").insert({
          user_id: rule.user_id,
          type: "recurring_confirmation",
          title: `Confirm ${rule.note || "Recurring Transaction"}`,
          content: `Your ${rule.frequency} ${isIncome ? "income" : "expense"} of ₹${rule.amount} is due. Shall we log it?`,
          metrics: { 
            amount: rule.amount, 
            category: rule.category, 
            subcategory: rule.subcategory, 
            note: rule.note, 
            date: next, 
            payment_method: rule.payment_method,
            type: isIncome ? "income" : "expense"
          },
          actions: [
            { 
              label: "Confirm & Log", 
              type: "action", 
              payload: { 
                handler: "log_recurring", 
                data: {
                  user_id: rule.user_id,
                  amount: rule.amount,
                  category: rule.category,
                  subcategory: rule.subcategory,
                  note: rule.note ? `${rule.note} (recurring)` : "Recurring",
                  date: next,
                  payment_method: rule.payment_method,
                  type: isIncome ? "income" : "expense"
                }
              } 
            },
            { label: "Edit Details", type: "navigate", payload: { target: "add_expense", edit: true } }
          ]
        });

        if (!pulseErr) { created += 1; localCreated += 1; last = next; }
      }
      next = advance(next, rule.frequency as string, rule.day_of_month as number | null | undefined);
      if (localCreated > 60) break;
    }
    await supabase.from("recurring_expenses").update({
      next_due_date: next,
      last_run_date: last,
    }).eq("id", id);
    results.push({ id, created: localCreated, next });
  }

  return { created, results };
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req) });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabaseAdmin = createClient(url, serviceKey);

  const expectedCron = Deno.env.get("CRON_SECRET");
  const cronHeader = req.headers.get("x-cron-secret");
  const cronOk = Boolean(expectedCron && cronHeader && cronHeader === expectedCron);

  if (!cronOk) {
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: auth } } });
    const { data: { user }, error: authErr } = await userClient.auth.getUser();
    if (authErr || !user) return jsonResponse(req, { error: "Unauthorized" }, 401);

    const today = isoDate(new Date());
    const { data: due, error } = await supabaseAdmin
      .from("recurring_expenses")
      .select("*")
      .eq("active", true)
      .eq("user_id", user.id)
      .lte("next_due_date", today);

    if (error) return jsonResponse(req, { ok: false, error: "Query failed" }, 500);

    const { created, results } = await processRules(supabaseAdmin, (due ?? []) as Record<string, unknown>[]);
    return jsonResponse(req, { ok: true, created, results });
  }

  const today = isoDate(new Date());
  const { data: due, error } = await supabaseAdmin
    .from("recurring_expenses")
    .select("*")
    .eq("active", true)
    .lte("next_due_date", today);

  if (error) return jsonResponse(req, { ok: false, error: "Query failed" }, 500);

  const { created, results } = await processRules(supabaseAdmin, (due ?? []) as Record<string, unknown>[]);
  return jsonResponse(req, { ok: true, created, results });
});
