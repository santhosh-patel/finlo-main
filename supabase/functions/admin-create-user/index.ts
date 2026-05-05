// Admin-only: create a new app user with name/email/password.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

interface Body {
  email?: string;
  password?: string;
  display_name?: string;
  role?: "admin" | "user";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

  const auth = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: userResp, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userResp.user) {
    return json({ error: "Unauthorized" }, 401);
  }

  const admin = createClient(url, serviceKey);
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userResp.user.id, _role: "admin" });
  if (!isAdmin) return json({ error: "Forbidden" }, 403);

  let body: Body;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const display_name = (body.display_name ?? "").trim() || email.split("@")[0];
  const role: "admin" | "user" = body.role === "admin" ? "admin" : "user";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return json({ error: "Invalid email" }, 400);
  if (password.length < 6) return json({ error: "Password must be at least 6 characters" }, 400);

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { display_name },
  });
  if (createErr) return json({ error: createErr.message }, 400);

  const newId = created.user!.id;
  // Ensure profile + exactly one app role even if account triggers are unavailable.
  await admin.from("profiles").upsert(
    { user_id: newId, email, display_name }, { onConflict: "user_id" },
  );
  await admin.from("user_roles").delete().eq("user_id", newId);
  await admin.from("user_roles").insert({ user_id: newId, role });

  await admin.from("admin_audit_log").insert({
    actor_id: userResp.user.id,
    actor_email: userResp.user.email,
    action: "create_user",
    target_user_id: newId,
    target_email: email,
    details: { display_name, role },
  });

  return json({ ok: true, user_id: newId });
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
