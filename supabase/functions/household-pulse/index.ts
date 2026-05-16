import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    const { household_id } = await req.json();
    if (!household_id) throw new Error("Missing household_id");

    // 1. Get current month range
    const now = new Date();
    const from = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const to = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59).toISOString();

    // 2. Fetch all expenses for the household
    const { data: expenses } = await supabase
      .from("expenses")
      .select("*")
      .eq("household_id", household_id)
      .is("deleted_at", null)
      .gte("date", from)
      .lte("date", to);

    // 3. Fetch household members
    const { data: members } = await supabase
      .from("profiles")
      .select("user_id, display_name")
      .eq("household_id", household_id);

    if (!expenses || !members) throw new Error("Data fetch failed");

    // 4. Calculate stats
    const totalSpent = expenses.reduce((sum, e) => sum + (e.type === "expense" ? Number(e.amount) : 0), 0);
    const contributions = members.map(m => {
      const spent = expenses
        .filter(e => e.user_id === m.user_id && e.type === "expense")
        .reduce((sum, e) => sum + Number(e.amount), 0);
      return { 
        name: m.display_name || "Partner", 
        spent, 
        percentage: totalSpent > 0 ? (spent / totalSpent) * 100 : 0 
      };
    });

    // 5. Detect biggest category
    const catMap: Record<string, number> = {};
    expenses.forEach(e => {
      if (e.type === "expense") {
        catMap[e.category] = (catMap[e.category] || 0) + Number(e.amount);
      }
    });
    const biggestCat = Object.entries(catMap).sort((a, b) => b[1] - a[1])[0];

    // 6. Generate Pulse Cards
    const pulses = [];

    // Fairness Nudge (only if imbalance > 15%)
    if (contributions.length === 2) {
      const diff = Math.abs(contributions[0].percentage - contributions[1].percentage);
      if (diff > 15) {
        const higher = contributions[0].spent > contributions[1].spent ? contributions[0] : contributions[1];
        pulses.push({
          id: `fairness-\${Date.now()}`,
          type: "insight",
          title: "Fairness Check",
          message: `\${higher.name} covered \${higher.percentage.toFixed(0)}% of household expenses this month. Maybe handle the next big grocery run?`,
          icon: "heart",
        });
      }
    }

    // Monthly Summary
    pulses.push({
      id: `summary-\${Date.now()}`,
      type: "insight",
      title: "Monthly Pulse",
      message: `You've spent \${totalSpent.toFixed(0)} together this month. \${biggestCat ? \`\${biggestCat[0]} was your biggest shared expense.\` : "Keep it up!"}`,
      icon: "zap",
    });

    return new Response(JSON.stringify({ pulses }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: corsHeaders,
    });
  }
});
