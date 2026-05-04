// One-shot seed for the initial admin account.
// Idempotent: safe to call multiple times.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

const ADMINS = [
  { email: "admin@finlo.ai", password: "Chinni@2003", name: "Finlo Admin", role: "admin" as const },
  { email: "santhosh@finlo.ai", password: "Chinni@2003", name: "Santhosh", role: "user" as const },
  { email: "amaan@finlo.ai", password: "Amaan@2002", name: "Amaan", role: "user" as const },
];

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  );

  const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
  const results: Array<{ email: string; user_id?: string; error?: string }> = [];

  for (const a of ADMINS) {
    let userId: string | null = null;
    const existing = list?.users.find((u) => u.email?.toLowerCase() === a.email.toLowerCase());
    if (existing) {
      userId = existing.id;
    } else {
      const { data: created, error } = await supabase.auth.admin.createUser({
        email: a.email, password: a.password, email_confirm: true,
        user_metadata: { display_name: a.name },
      });
      if (error) { results.push({ email: a.email, error: error.message }); continue; }
      userId = created.user!.id;
    }
    await supabase.from("profiles").upsert(
      { user_id: userId, email: a.email, display_name: a.name },
      { onConflict: "user_id" },
    );
    await supabase.from("user_roles").upsert(
      { user_id: userId, role: a.role },
      { onConflict: "user_id,role" },
    );
    results.push({ email: a.email, user_id: userId });
  }

  return new Response(JSON.stringify({ ok: true, results }), {
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
});
