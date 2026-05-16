import { serve } from "std/http/server.ts";
import { createClient } from "supabase";
import webpush from "web-push";

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

    const { user_id, title, body, url } = await req.json();
    if (!user_id) throw new Error("Missing user_id");

    // Fetch subscriptions
    const { data: subs, error: subError } = await supabase
      .from("push_subscriptions")
      .select("*")
      .eq("user_id", user_id);

    if (subError) throw subError;
    if (!subs || subs.length === 0) {
      return new Response(JSON.stringify({ success: true, message: "No subscriptions found" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Configure web-push
    // These should be set in Supabase Secrets
    const vapidPublicKey = Deno.env.get("VAPID_PUBLIC_KEY") || "BOxxH6qoOFBckNg2dLFnyhsY_XF4_7kDQOgb6bN-EbkSvk-DrIw2agFOQzOHYQg43xFw3ItxfMV2gKyFS52YWLg";
    const vapidPrivateKey = Deno.env.get("VAPID_PRIVATE_KEY");
    const mailTo = Deno.env.get("VAPID_MAILTO") || "mailto:admin@finlo.ai";

    if (!vapidPrivateKey) {
      console.warn("VAPID_PRIVATE_KEY not set. Push will not work in production.");
    }

    webpush.setVapidDetails(mailTo, vapidPublicKey, vapidPrivateKey || "");

    const payload = JSON.stringify({ title, body, url });
    
    const results = await Promise.all(subs.map(async (sub) => {
      try {
        const pushSubscription = {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth
          }
        };
        await webpush.sendNotification(pushSubscription, payload);
        return { endpoint: sub.endpoint, success: true };
      } catch (err) {
        console.error(`Error sending to ${sub.endpoint}:`, err);
        // If subscription is expired/invalid, delete it
        if (err.statusCode === 410 || err.statusCode === 404) {
          await supabase.from("push_subscriptions").delete().eq("endpoint", sub.endpoint);
        }
        return { endpoint: sub.endpoint, success: false, error: err.message };
      }
    }));

    return new Response(JSON.stringify({ success: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: corsHeaders,
    });
  }
});
