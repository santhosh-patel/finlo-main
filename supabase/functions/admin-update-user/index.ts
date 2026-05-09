// Admin-only: update or delete a user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getCorsHeaders, jsonResponse } from "../_shared/cors.ts";
import { validatePasswordServer } from "../_shared/password.ts";

interface Body {
  action: "update" | "delete" | "set_role";
  user_id: string;
  display_name?: string;
  password?: string;
  role?: "admin" | "user";
  enabled?: boolean;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req) });

  const url = Deno.env.get("SUPABASE_URL")!;
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") ?? Deno.env.get("SUPABASE_ANON_KEY")!;

  const auth = req.headers.get("Authorization") ?? "";
  const userClient = createClient(url, anonKey, { global: { headers: { Authorization: auth } } });
  const { data: userResp, error: userErr } = await userClient.auth.getUser();
  if (userErr || !userResp.user) return jsonResponse(req, { error: "Unauthorized" }, 401);

  const admin = createClient(url, serviceKey);
  const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userResp.user.id, _role: "admin" });
  if (!isAdmin) return jsonResponse(req, { error: "Forbidden" }, 403);

  let body: Body;
  try { body = await req.json(); } catch { return jsonResponse(req, { error: "Invalid JSON" }, 400); }
  if (!body.user_id) return jsonResponse(req, { error: "user_id required" }, 400);

  const logAudit = async (action: string, details: Record<string, unknown> = {}) => {
    const { data: tProf } = await admin
      .from("profiles").select("email").eq("user_id", body.user_id).maybeSingle();
    await admin.from("admin_audit_log").insert({
      actor_id: userResp.user.id,
      actor_email: userResp.user.email,
      action,
      target_user_id: body.user_id,
      target_email: tProf?.email ?? null,
      details,
    });
  };

  if (body.action === "delete") {
    if (body.user_id === userResp.user.id) return jsonResponse(req, { error: "Cannot delete yourself" }, 400);
    await logAudit("delete_user");
    const { error } = await admin.auth.admin.deleteUser(body.user_id);
    if (error) return jsonResponse(req, { error: error.message }, 400);
    return jsonResponse(req, { ok: true });
  }

  if (body.action === "update") {
    const updates: Record<string, unknown> = {};
    if (body.password) {
      const pwdErr = validatePasswordServer(body.password);
      if (pwdErr) return jsonResponse(req, { error: pwdErr }, 400);
      updates.password = body.password;
    }
    if (body.display_name !== undefined) {
      updates.user_metadata = { display_name: body.display_name };
    }
    if (Object.keys(updates).length) {
      const { error } = await admin.auth.admin.updateUserById(body.user_id, updates);
      if (error) return jsonResponse(req, { error: error.message }, 400);
    }
    if (body.display_name !== undefined) {
      await admin.from("profiles").update({ display_name: body.display_name }).eq("user_id", body.user_id);
    }
    await logAudit("update_user", {
      changed_password: !!body.password,
      display_name: body.display_name,
    });
    return jsonResponse(req, { ok: true });
  }

  if (body.action === "set_role") {
    const role = body.role === "admin" ? "admin" : "user";
    if (body.enabled) {
      await admin.from("user_roles").upsert(
        { user_id: body.user_id, role }, { onConflict: "user_id,role" },
      );
    } else {
      if (role === "admin" && body.user_id === userResp.user.id) {
        return jsonResponse(req, { error: "Cannot remove your own admin role" }, 400);
      }
      await admin.from("user_roles").delete().eq("user_id", body.user_id).eq("role", role);
    }
    await logAudit(body.enabled ? "grant_role" : "revoke_role", { role });
    return jsonResponse(req, { ok: true });
  }

  return jsonResponse(req, { error: "Unknown action" }, 400);
});
