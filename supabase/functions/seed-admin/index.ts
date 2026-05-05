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

  const users = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data: list, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) return json({ ok: false, error: error.message }, 500);
    users.push(...(list.users ?? []));
    if ((list.users ?? []).length < 1000) break;
  }
  const results: Array<{ email: string; role: string; user_id?: string; status?: string; error?: string }> = [];

  for (const a of ADMINS) {
    let userId: string | null = null;
    const existing = users.find((u) => u.email?.toLowerCase() === a.email.toLowerCase());
    if (existing) {
      userId = existing.id;
      // Ensure password is up to date
      const { error } = await supabase.auth.admin.updateUserById(userId, {
        password: a.password,
        email_confirm: true,
        user_metadata: { display_name: a.name },
      });
      if (error) { results.push({ email: a.email, role: a.role, user_id: userId, error: error.message }); continue; }
    } else {
      const { data: created, error } = await supabase.auth.admin.createUser({
        email: a.email, password: a.password, email_confirm: true,
        user_metadata: { display_name: a.name },
      });
      if (error) { results.push({ email: a.email, role: a.role, error: error.message }); continue; }
      userId = created.user!.id;
    }
    await supabase.from("profiles").upsert(
      { user_id: userId, email: a.email, display_name: a.name },
      { onConflict: "user_id" },
    );
    // Replace roles to match desired role exactly
    await supabase.from("user_roles").delete().eq("user_id", userId);
    await supabase.from("user_roles").insert({ user_id: userId, role: a.role });
    results.push({ email: a.email, role: a.role, user_id: userId, status: existing ? "updated" : "created" });
  }

  return json({ ok: results.every((r) => !r.error), results });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
