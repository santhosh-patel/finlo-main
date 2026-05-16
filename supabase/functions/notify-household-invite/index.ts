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
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    );

    const authHeader = req.headers.get("Authorization");
    const { data: { user }, error: authError } = await supabase.auth.getUser(
      authHeader?.split(" ")[1],
    );
    if (authError || !user) throw new Error("Unauthorized");

    const { invite_id } = await req.json();
    if (!invite_id) throw new Error("Missing invite_id");

    const { data: invite, error: inviteError } = await supabase
      .from("household_invites")
      .select("id, email, household_id, inviter_id, status")
      .eq("id", invite_id)
      .single();

    if (inviteError || !invite) throw new Error("Invite not found");
    if (invite.status !== "pending") throw new Error("Invite is not pending");
    if (invite.inviter_id !== user.id) throw new Error("Only the inviter can notify");

    const normalizedEmail = invite.email.trim().toLowerCase();
    const { data: invitee } = await supabase
      .from("profiles")
      .select("user_id")
      .eq("email", normalizedEmail)
      .maybeSingle();

    if (!invitee?.user_id) {
      return new Response(
        JSON.stringify({ success: true, message: "Invitee has not signed up yet" }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const [{ data: inviter }, { data: household }] = await Promise.all([
      supabase.from("profiles").select("display_name, email").eq("user_id", invite.inviter_id).single(),
      supabase.from("households").select("name").eq("id", invite.household_id).single(),
    ]);

    const inviterName =
      inviter?.display_name?.trim() || inviter?.email?.split("@")[0] || "A partner";
    const householdName = household?.name?.trim() || "Shared Space";

    await supabase.from("notifications").insert({
      user_id: invitee.user_id,
      title: "Household invitation",
      body: `${inviterName} invited you to join “${householdName}”`,
      kind: "invite",
      link: "/?settings=household",
    });

    try {
      await supabase.functions.invoke("send-push", {
        body: {
          user_id: invitee.user_id,
          title: "Household invitation",
          body: `${inviterName} invited you to join their shared space`,
          url: "/?settings=household",
        },
      });
    } catch {
      // Push is optional
    }

    return new Response(JSON.stringify({ success: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    return new Response(JSON.stringify({ error: message }), {
      status: 400,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
