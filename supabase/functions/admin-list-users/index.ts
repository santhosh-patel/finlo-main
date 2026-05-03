// Admin-only: list all users with profile + roles.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

  const auth = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: userResp, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userResp.user) return json({ error: "Unauthorized" }, 401);

  const admin = createClient(url, serviceKey);
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userResp.user.id, _role: "admin" });
  if (!isAdmin) return json({ error: "Forbidden" }, 403);

  const { data: profiles } = await admin.from("profiles").select("user_id, email, display_name, created_at");
  const { data: roles } = await admin.from("user_roles").select("user_id, role");
  const roleMap = new Map<string, string[]>();
  (roles ?? []).forEach((r) => {
    const arr = roleMap.get(r.user_id) ?? [];
    arr.push(r.role);
    roleMap.set(r.user_id, arr);
  });

  const out = (profiles ?? []).map((p) => ({
    user_id: p.user_id,
    email: p.email,
    display_name: p.display_name,
    created_at: p.created_at,
    roles: roleMap.get(p.user_id) ?? [],
  }));

  return json({ users: out });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
