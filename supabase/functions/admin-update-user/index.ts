// Admin-only: update or delete a user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
const corsHeaders = { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type" };

interface Body {
  action: "update" | "delete" | "set_role";
  user_id: string;
  display_name?: string;
  password?: string;
  role?: "admin" | "user";
  enabled?: boolean; // for set_role: true=add, false=remove
}

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

  let body: Body;
  try { body = await req.json(); } catch { return json({ error: "Invalid JSON" }, 400); }
  if (!body.user_id) return json({ error: "user_id required" }, 400);

  if (body.action === "delete") {
    if (body.user_id === userResp.user.id) return json({ error: "Cannot delete yourself" }, 400);
    const { error } = await admin.auth.admin.deleteUser(body.user_id);
    if (error) return json({ error: error.message }, 400);
    return json({ ok: true });
  }

  if (body.action === "update") {
    const updates: Record<string, unknown> = {};
    if (body.password) {
      if (body.password.length < 6) return json({ error: "Password too short" }, 400);
      updates.password = body.password;
    }
    if (body.display_name !== undefined) {
      updates.user_metadata = { display_name: body.display_name };
    }
    if (Object.keys(updates).length) {
      const { error } = await admin.auth.admin.updateUserById(body.user_id, updates);
      if (error) return json({ error: error.message }, 400);
    }
    if (body.display_name !== undefined) {
      await admin.from("profiles").update({ display_name: body.display_name }).eq("user_id", body.user_id);
    }
    return json({ ok: true });
  }

  if (body.action === "set_role") {
    const role = body.role === "admin" ? "admin" : "user";
    if (body.enabled) {
      await admin.from("user_roles").upsert(
        { user_id: body.user_id, role }, { onConflict: "user_id,role" },
      );
    } else {
      if (role === "admin" && body.user_id === userResp.user.id) {
        return json({ error: "Cannot remove your own admin role" }, 400);
      }
      await admin.from("user_roles").delete().eq("user_id", body.user_id).eq("role", role);
    }
    return json({ ok: true });
  }

  return json({ error: "Unknown action" }, 400);
});

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
