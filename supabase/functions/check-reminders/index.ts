import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getCorsHeaders, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req) });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(url, serviceKey);

  const today = new Date();
  const tomorrow = new Date(today);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = tomorrow.toISOString().split("T")[0];

  // 1. Check for Due Loans
  const { data: loans } = await supabase
    .from("loans")
    .select("*")
    .eq("status", "open")
    .eq("due_date", tomorrowStr);

  for (const loan of loans || []) {
    await supabase.from("daily_pulses").insert({
      user_id: loan.user_id,
      type: "loan_reminder",
      title: `Loan Due Tomorrow: ${loan.counterparty}`,
      content: `Your loan of ₹${loan.amount} is due tomorrow. Don't forget to ${loan.direction === 'lent' ? 'collect' : 'pay'}!`,
      metrics: { loan_id: loan.id, amount: loan.amount },
      actions: [
        { label: "Record Payment", type: "navigate", payload: { target: "loans", loan_id: loan.id } },
        { label: "View Details", type: "navigate", payload: { target: "loans" } }
      ]
    });
  }

  // 2. Check for Inactivity (Ghost Reminder)
  // Get users who haven't logged an expense in 3 days
  const threeDaysAgo = new Date(today);
  threeDaysAgo.setDate(threeDaysAgo.getDate() - 3);
  const threeDaysAgoStr = threeDaysAgo.toISOString().split("T")[0];

  const { data: users } = await supabase.from("profiles").select("user_id");
  
  for (const user of users || []) {
    const { count } = await supabase
      .from("expenses")
      .select("*", { count: "exact", head: true })
      .eq("user_id", user.user_id)
      .gte("date", threeDaysAgoStr);

    if (count === 0) {
      // Check if we sent a nudge recently
      const { data: existing } = await supabase
        .from("daily_pulses")
        .select("id")
        .eq("user_id", user.user_id)
        .eq("type", "inactivity_nudge")
        .gte("created_at", threeDaysAgo.toISOString())
        .limit(1);

      if (!existing || existing.length === 0) {
        await supabase.from("daily_pulses").insert({
          user_id: user.user_id,
          type: "inactivity_nudge",
          title: "Keeping track?",
          content: "You haven't logged any expenses in 3 days. Maya is ready to help you catch up!",
          actions: [{ label: "Log Expense", type: "navigate", payload: { target: "add_expense" } }]
        });
      }
    }
  }

  return jsonResponse(req, { ok: true });
});
