import { serve } from "std/http/server.ts";
import { createClient } from "supabase";

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

    // Fairness & Settlement (only if 2 members)
    if (contributions.length === 2) {
      const perPerson = totalSpent / 2;
      const member1 = contributions[0];
      const member2 = contributions[1];
      
      const imbalance = Math.abs(member1.percentage - member2.percentage);
      
      if (imbalance > 5) { // Show settlement if > 5% diff
        const overpaid = member1.spent > perPerson ? member1 : member2;
        const underpaid = member1.spent < perPerson ? member1 : member2;
        const amount = overpaid.spent - perPerson;

        pulses.push({
          type: "insight",
          title: "Household Balance",
          content: `${underpaid.name} owes ${overpaid.name} ₹${amount.toFixed(0)} to settle this month's shared expenses.`,
          metrics: { amount, owes_to: overpaid.name },
          actions: [
            { label: "Settle Up", type: "navigate", payload: { target: "loans" } }
          ]
        });
      }
    }

    // Monthly Summary
    pulses.push({
      type: "insight",
      title: "Shared Pulse",
      content: `You've spent ₹${totalSpent.toFixed(0)} together this month. ${biggestCat ? `${biggestCat[0]} was your biggest category.` : "Budgeting looks healthy!"}`,
      metrics: { totalSpent },
      actions: [{ label: "View Ledger", type: "navigate", payload: { target: "search" } }]
    });

    // 7. Persist Pulses for ALL members
    for (const member of members) {
      const inserts = pulses.map(p => ({
        user_id: member.user_id,
        type: p.type,
        title: p.title,
        content: p.content,
        metrics: p.metrics,
        actions: p.actions,
      }));
      
      await supabase.from("daily_pulses").insert(inserts);
    }

    return new Response(JSON.stringify({ success: true, count: pulses.length }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: corsHeaders,
    });
  }
});
