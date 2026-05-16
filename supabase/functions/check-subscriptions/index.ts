
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

  const today = new Date();
  const todayStr = isoDate(today);

  // Query all active subscriptions
  const { data: subs, error } = await supabase
    .from("subscriptions")
    .select("*")
    .eq("active", true);

  if (error) return jsonResponse(req, { error: error.message }, 500);

  let notificationsCreated = 0;

  for (const sub of subs) {
    const nextDate = new Date(sub.next_billing_date + "T00:00:00");
    const diff = Math.ceil((nextDate.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    // If billing date is within the alert window
    if (diff >= 0 && diff <= sub.alert_days_before) {
      const title = `Subscription Due: ${sub.service_name}`;
      const body = `Your ${sub.billing_cycle} payment of ${sub.currency} ${sub.amount} is due on ${sub.next_billing_date}.`;

      // Simple deduplication: don't notify twice in the same day for the same sub
      const { data: existing } = await supabase
        .from("notifications")
        .select("id")
        .eq("user_id", sub.user_id)
        .eq("title", title)
        .gte("created_at", todayStr);

      if (!existing || existing.length === 0) {
        await supabase.from("notifications").insert({
          user_id: sub.user_id,
          kind: "subscription_alert",
          title,
          body,
        });
        notificationsCreated++;
      }
    }
  }

  return jsonResponse(req, { ok: true, notificationsCreated });
});
