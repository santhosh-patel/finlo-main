// Admin-only: create a new app user with name/email/password.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getCorsHeaders, jsonResponse } from "../_shared/cors.ts";
import { validatePasswordServer } from "../_shared/password.ts";

interface Body {
  email?: string;
  password?: string;
  display_name?: string;
  role?: "admin" | "user";
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req) });
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405, headers: getCorsHeaders(req) });
  }

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

  const email = (body.email ?? "").trim().toLowerCase();
  const password = body.password ?? "";
  const display_name = (body.display_name ?? "").trim() || email.split("@")[0];
  const role: "admin" | "user" = body.role === "admin" ? "admin" : "user";

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return jsonResponse(req, { error: "Invalid email" }, 400);
  const pwdErr = validatePasswordServer(password);
  if (pwdErr) return jsonResponse(req, { error: pwdErr }, 400);

  const { data: created, error: createErr } = await admin.auth.admin.createUser({
    email, password, email_confirm: true, user_metadata: { display_name },
  });
  if (createErr) return jsonResponse(req, { error: createErr.message }, 400);

  const newId = created.user!.id;
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

  return jsonResponse(req, { ok: true, user_id: newId });
});
