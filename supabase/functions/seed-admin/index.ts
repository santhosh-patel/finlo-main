// One-shot seed for the initial admin account.
// Idempotent: safe to call multiple times.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

const ADMIN_EMAIL = "santhoshpatel002@gmail.com";
const ADMIN_PASSWORD = "Chinni@2003";
const ADMIN_NAME = "Santhosh";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  // Check if admin user already exists by listing users (paged)
  let userId: string | null = null;
  const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  const existing = list?.users.find((u) => u.email?.toLowerCase() === ADMIN_EMAIL.toLowerCase());
  if (existing) {
    userId = existing.id;
  } else {
    const { data: created, error } = await supabase.auth.admin.createUser({
      email: ADMIN_EMAIL,
      password: ADMIN_PASSWORD,
      email_confirm: true,
      user_metadata: { display_name: ADMIN_NAME },
    });
    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    userId = created.user!.id;
  }

  // Ensure profile
  await supabase.from("profiles").upsert(
    { user_id: userId, email: ADMIN_EMAIL, display_name: ADMIN_NAME },
    { onConflict: "user_id" },
  );
  // Ensure admin role
  await supabase.from("user_roles").upsert(
    { user_id: userId, role: "admin" },
    { onConflict: "user_id,role" },
  );

  return new Response(JSON.stringify({ ok: true, user_id: userId }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
