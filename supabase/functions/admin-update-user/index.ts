// Admin-only: update or delete a user.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getCorsHeaders, jsonResponse } from "../_shared/cors.ts";
import { validatePasswordServer } from "../_shared/password.ts";

interface Body {
  action: "update" | "delete" | "set_role" | "set_disabled" | "generate_link" | "broadcast_notification";
  user_id?: string;
  display_name?: string;
  password?: string;
  role?: "admin" | "user";
  enabled?: boolean;
  /** For generate_link */
  link_type?: "recovery" | "invite" | "magiclink";
  redirectTo?: string;
  title?: string;
  body?: string;
  kind?: string;
  link?: string;
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
  if (!body.user_id && body.action !== "broadcast_notification") return jsonResponse(req, { error: "user_id required" }, 400);

  const logAudit = async (action: string, details: Record<string, unknown> = {}) => {
    const { data: tProf } = body.user_id 
      ? await admin.from("profiles").select("email").eq("user_id", body.user_id).maybeSingle()
      : { data: null };
    await admin.from("admin_audit_log").insert({
      actor_id: userResp.user.id,
      actor_email: userResp.user.email,
      action,
      target_user_id: body.user_id ?? null,
      target_email: tProf?.email ?? null,
      details,
    });
  };

  if (body.action === "broadcast_notification") {
    const { title, body: notifBody, kind = "broadcast", link } = body;
    if (!title || !notifBody) {
      return jsonResponse(req, { error: "title and body are required for broadcasting announcements" }, 400);
    }
    // Get all profiles/users to notify
    const { data: profiles, error: pErr } = await admin.from("profiles").select("user_id");
    if (pErr) return jsonResponse(req, { error: pErr.message }, 400);

    const userIds = (profiles ?? []).map((p) => p.user_id).filter(Boolean);
    if (userIds.length > 0) {
      const inserts = userIds.map((uid) => ({
        user_id: uid,
        kind,
        title,
        body: notifBody,
        link: link || null,
      }));
      const { error: insErr } = await admin.from("notifications").insert(inserts);
      if (insErr) return jsonResponse(req, { error: insErr.message }, 400);
    }

    await admin.from("admin_audit_log").insert({
      actor_id: userResp.user.id,
      actor_email: userResp.user.email,
      action: "broadcast_notification",
      target_user_id: null,
      target_email: "ALL_USERS",
      details: { title, kind, link, recipient_count: userIds.length },
    });

    return jsonResponse(req, { ok: true, recipientCount: userIds.length });
  }

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
      const { error } = await admin.auth.admin.updateUserById(body.user_id!, updates);
      if (error) return jsonResponse(req, { error: error.message }, 400);
    }
    if (body.display_name !== undefined) {
      await admin.from("profiles").update({ display_name: body.display_name }).eq("user_id", body.user_id!);
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
        { user_id: body.user_id!, role }, { onConflict: "user_id,role" },
      );
    } else {
      if (role === "admin" && body.user_id === userResp.user.id) {
        return jsonResponse(req, { error: "Cannot remove your own admin role" }, 400);
      }
      await admin.from("user_roles").delete().eq("user_id", body.user_id!).eq("role", role);
    }
    await logAudit(body.enabled ? "grant_role" : "revoke_role", { role });
    return jsonResponse(req, { ok: true });
  }

  if (body.action === "set_disabled") {
    if (body.user_id === userResp.user.id && body.enabled === false) {
      return jsonResponse(req, { error: "Cannot disable yourself" }, 400);
    }
    const disable = body.enabled === false;
    const updates: Record<string, unknown> = disable
      ? { ban_duration: "876000h" } // ~100 years
      : { ban_duration: "none" };
    const { error } = await admin.auth.admin.updateUserById(body.user_id!, updates);
    if (error) return jsonResponse(req, { error: error.message }, 400);
    await logAudit(disable ? "disable_user" : "enable_user");
    return jsonResponse(req, { ok: true });
  }

  if (body.action === "generate_link") {
    const linkType = body.link_type === "invite" || body.link_type === "magiclink" ? body.link_type : "recovery";
    const { data: tProf } = await admin
      .from("profiles").select("email").eq("user_id", body.user_id!).maybeSingle();
    const email = (tProf?.email ?? "").trim();
    if (!email) return jsonResponse(req, { error: "Target email not found" }, 400);

    const { data, error } = await admin.auth.admin.generateLink({
      type: linkType,
      email,
      options: body.redirectTo ? { redirectTo: body.redirectTo } : undefined,
    } as any);
    if (error) return jsonResponse(req, { error: error.message }, 400);

    const props = (data as unknown as { properties?: Record<string, unknown> | null })?.properties ?? null;
    const link = props && typeof props.action_link === "string" ? props.action_link : null;
    await logAudit("generate_link", { type: linkType });
    return jsonResponse(req, { ok: true, email, link, properties: props });
  }

  return jsonResponse(req, { error: "Unknown action" }, 400);
});
