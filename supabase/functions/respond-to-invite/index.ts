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

    const { invite_id, action } = await req.json();
    if (!invite_id || !action) throw new Error("Missing invite_id or action");

    // Get the user from the JWT
    const authHeader = req.headers.get("Authorization");
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader?.split(" ")[1]);
    if (authError || !user) throw new Error("Unauthorized");

    // 1. Fetch the invite
    const { data: invite, error: inviteError } = await supabase
      .from("household_invites")
      .select("*")
      .eq("id", invite_id)
      .single();

    if (inviteError || !invite) throw new Error("Invite not found");
    if (invite.status !== "pending") throw new Error("Invite is no longer pending");
    
    // Verify the invite is for this user (by email)
    const { data: profile } = await supabase
      .from("profiles")
      .select("email")
      .eq("user_id", user.id)
      .single();
    
    if (invite.email.toLowerCase() !== profile?.email?.toLowerCase() && invite.email.toLowerCase() !== user.email?.toLowerCase()) {
      throw new Error("This invite is not for you");
    }

    if (action === "accept") {
      // 2. Update user profile with household_id
      const { error: profileUpdateError } = await supabase
        .from("profiles")
        .update({ household_id: invite.household_id })
        .eq("user_id", user.id);

      if (profileUpdateError) throw profileUpdateError;

      // 3. Mark the invite as accepted
      await supabase
        .from("household_invites")
        .update({ status: "accepted" })
        .eq("id", invite_id);

      // 4. Auto-clean: Reject any other pending invites for this user
      await supabase
        .from("household_invites")
        .update({ status: "rejected" })
        .eq("email", invite.email)
        .neq("id", invite_id)
        .eq("status", "pending");
        
      // 5. Auto-clean: Reject any invites this user SENT to others (to resolve circular invites)
      await supabase
        .from("household_invites")
        .update({ status: "expired" })
        .eq("inviter_id", user.id)
        .eq("status", "pending");

      return new Response(JSON.stringify({ success: true, message: "Joined household" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });

    } else if (action === "reject") {
      await supabase
        .from("household_invites")
        .update({ status: "rejected" })
        .eq("id", invite_id);

      return new Response(JSON.stringify({ success: true, message: "Invite rejected" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    throw new Error("Invalid action");

  } catch (err: any) {
    return new Response(JSON.stringify({ error: err.message }), {
      status: 400,
      headers: corsHeaders,
    });
  }
});
