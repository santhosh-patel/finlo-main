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

  const { data: authUsers } = await admin.auth.admin.listUsers({ page: 1, perPage: 1000 });
  const { data: profiles } = await admin.from("profiles").select("user_id, email, display_name, created_at");
  const { data: roles } = await admin.from("user_roles").select("user_id, role");
  const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));
  const roleMap = new Map<string, string[]>();
  (roles ?? []).forEach((r) => {
    const arr = roleMap.get(r.user_id) ?? [];
    arr.push(r.role);
    roleMap.set(r.user_id, arr);
  });

  const out = (authUsers?.users ?? []).map((u) => {
    const p = profileMap.get(u.id);
    return {
    user_id: u.id,
    email: p?.email ?? u.email ?? "",
    display_name: p?.display_name ?? u.user_metadata?.display_name ?? u.email?.split("@")[0] ?? "",
    created_at: p?.created_at ?? u.created_at,
    roles: roleMap.get(p.user_id) ?? [],
  }}).filter((u) => u.email);

  return json({ users: out });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
