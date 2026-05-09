// Admin-only: list all users with profile + roles.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getCorsHeaders, jsonResponse } from "../_shared/cors.ts";

interface Body {
  page?: number;
  perPage?: number;
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

  let body: Body = {};
  if (req.method === "POST") {
    try { body = await req.json(); } catch { body = {}; }
  }
  const page = Math.max(1, Math.floor(body.page ?? 1));
  const perPage = Math.min(200, Math.max(1, Math.floor(body.perPage ?? 50)));

  const { data: authUsers, error: listErr } = await admin.auth.admin.listUsers({ page, perPage });
  if (listErr) return jsonResponse(req, { error: listErr.message }, 400);

  const ids = (authUsers?.users ?? []).map((u) => u.id).filter(Boolean);
  const { data: profiles } = ids.length
    ? await admin.from("profiles").select("user_id, email, display_name, created_at").in("user_id", ids)
    : { data: [] };
  const { data: roles } = ids.length
    ? await admin.from("user_roles").select("user_id, role").in("user_id", ids)
    : { data: [] };
  const profileMap = new Map((profiles ?? []).map((p) => [p.user_id, p]));
  const roleMap = new Map<string, string[]>();
  (roles ?? []).forEach((r) => {
    const arr = roleMap.get(r.user_id) ?? [];
    arr.push(r.role);
    roleMap.set(r.user_id, arr);
  });

  const out = (authUsers?.users ?? []).map((u) => {
    const p = profileMap.get(u.id);
    const bannedUntil = (u as unknown as { banned_until?: string | null }).banned_until ?? null;
    return {
      user_id: u.id,
      email: p?.email ?? u.email ?? "",
      display_name: p?.display_name ?? u.user_metadata?.display_name ?? u.email?.split("@")[0] ?? "",
      created_at: p?.created_at ?? u.created_at,
      roles: roleMap.get(u.id) ?? [],
      disabled: !!bannedUntil,
      banned_until: bannedUntil,
    };
  }).filter((u) => u.email);

  return jsonResponse(req, {
    users: out,
    page,
    perPage,
    hasMore: (authUsers?.users ?? []).length === perPage,
  });
});
