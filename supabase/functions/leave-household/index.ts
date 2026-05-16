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

    // Get the user from the JWT
    const authHeader = req.headers.get("Authorization");
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader?.split(" ")[1]);
    if (authError || !user) throw new Error("Unauthorized");

    // 1. Get the current household_id
    const { data: profile } = await supabase
      .from("profiles")
      .select("household_id")
      .eq("user_id", user.id)
      .single();

    if (!profile?.household_id) throw new Error("Not in a household");

    const oldHouseholdId = profile.household_id;

    // 2. Remove household_id from user's profile
    await supabase
      .from("profiles")
      .update({ household_id: null })
      .eq("user_id", user.id);

    // 3. (Optional) If they were the last member, we could clean up the household
    // but usually, it's safer to keep it or handle it separately.
    
    return new Response(JSON.stringify({ success: true, message: "Left household" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: corsHeaders,
    });
  }
});
