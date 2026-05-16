import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getCorsHeaders, jsonResponse } from "../_shared/cors.ts";

function isoDate(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req) });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const supabase = createClient(url, serviceKey);

  // 1. Get All Users (or a specific user if provided in body)
  const { user_id } = await req.json().catch(() => ({}));
  
  const query = supabase.from("profiles").select("user_id, email");
  if (user_id) query.eq("user_id", user_id);
  const { data: users, error: userErr } = await query;
  if (userErr) return jsonResponse(req, { error: userErr.message }, 500);

  // 2. Fetch Benchmarks
  const { data: benchmarks } = await supabase.from("anonymous_category_averages").select("*");
  const benchMap = new Map(benchmarks?.map(b => [b.category, b.avg_amount]));

  const today = new Date();
  const yesterday = new Date(today);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = isoDate(yesterday);

  let pulsesCreated = 0;

  for (const user of users) {
    const uid = user.user_id;

    // A. Yesterday's Spend
    const { data: yestExpenses } = await supabase
      .from("expenses")
      .select("amount, category")
      .eq("user_id", uid)
      .eq("date", yesterdayStr)
      .eq("type", "expense");
    
    const yTotal = yestExpenses?.reduce((a, b) => a + (b.amount || 0), 0) || 0;

    // B. Safe to Spend
    // Fetch budgets and MTD spending
    const monthStart = isoDate(new Date(today.getFullYear(), today.getMonth(), 1));
    const { data: budgets } = await supabase.from("budgets").select("*").eq("user_id", uid);
    const { data: mtdExpenses } = await supabase
      .from("expenses")
      .select("amount")
      .eq("user_id", uid)
      .gte("date", monthStart)
      .eq("type", "expense");
    
    const totalBudget = budgets?.reduce((a, b) => a + (b.amount || 0), 0) || 0;
    const totalMtd = mtdExpenses?.reduce((a, b) => a + (b.amount || 0), 0) || 0;
    const remainingBudget = Math.max(0, totalBudget - totalMtd);
    const daysLeft = new Date(today.getFullYear(), today.getMonth() + 1, 0).getDate() - today.getDate() + 1;
    const safeToSpend = Math.round(remainingBudget / daysLeft);

    // C. Benchmark Insights
    let insightText = "";
    if (yestExpenses && yestExpenses.length > 0) {
      const topCat = yestExpenses.reduce((a, b) => (a.amount > b.amount ? a : b));
      const avg = benchMap.get(topCat.category);
      if (avg) {
        const diff = topCat.amount - avg;
        if (diff > 0) insightText = `Your ${topCat.category} spend yesterday was higher than average. Try to balance it today!`;
        else insightText = `Great job! Your ${topCat.category} spend is below the community average.`;
      }
    }

    // D. Build the Pulse
    const title = yTotal > 0 ? `Yesterday you spent ₹${yTotal}` : "Morning Financial Pulse";
    const content = `Your safe-to-spend for today is ₹${safeToSpend}. ${insightText}`;
    
    const actions = [
      { label: "View Budgets", type: "navigate", payload: { target: "budgets" } },
      { label: "Add Expense", type: "navigate", payload: { target: "search" } } // Placeholder for quick add
    ];

    // E. Insert Pulse
    await supabase.from("daily_pulses").insert({
      user_id: uid,
      type: "morning_pulse",
      title,
      content,
      metrics: { yesterday_spend: yTotal, safe_to_spend: safeToSpend },
      actions
    });
    
    pulsesCreated++;
  }

  return jsonResponse(req, { ok: true, pulsesCreated });
});
