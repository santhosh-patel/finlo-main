// One-shot seed: set SEED_ADMINS secret to a JSON array of { email, password, name, role }.
// Admin JWT required; service role used only after role check.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getCorsHeaders, jsonResponse } from "../_shared/cors.ts";

type SeedRole = "admin" | "user";

interface SeedEntry {
  email: string;
  password: string;
  name: string;
  role: SeedRole;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req) });

  try {
    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;
    const auth = req.headers.get("Authorization") ?? "";
    const userClient = createClient(url, anonKey, { global: { headers: { Authorization: auth } } });
    const { data: userResp, error: userErr } = await userClient.auth.getUser();
    if (userErr || !userResp.user) return jsonResponse(req, { error: "Unauthorized" }, 401);

    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const admin = createClient(url, serviceKey);
    const { data: isAdmin } = await admin.rpc("has_role", { _user_id: userResp.user.id, _role: "admin" });
    if (!isAdmin) return jsonResponse(req, { error: "Forbidden" }, 403);

    const raw = Deno.env.get("SEED_ADMINS");
    let ADMINS: SeedEntry[] = [];
    if (raw) {
      try {
        ADMINS = JSON.parse(raw) as SeedEntry[];
      } catch {
        return jsonResponse(req, { ok: false, error: "SEED_ADMINS is not valid JSON" }, 400);
      }
    }
    if (!Array.isArray(ADMINS) || ADMINS.length === 0) {
      return jsonResponse(req, { ok: false, error: "SEED_ADMINS secret is not configured" }, 400);
    }

    const supabase = createClient(url, serviceKey);

    const users = [];
    for (let page = 1; page <= 20; page += 1) {
      const { data: list, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
      if (error) return jsonResponse(req, { ok: false, error: "Failed to list users" }, 500);
      users.push(...(list.users ?? []));
      if ((list.users ?? []).length < 1000) break;
    }
    const results: Array<{ email: string; role: string; user_id?: string; status?: string; error?: string }> = [];

    for (const a of ADMINS) {
      if (!a.email || !a.password || !a.name || !a.role) {
        results.push({ email: String(a.email ?? "?"), role: String(a.role ?? "?"), error: "Missing email, password, name, or role" });
        continue;
      }
      let userId: string | null = null;
      const existing = users.find((u) => u.email?.toLowerCase() === a.email.toLowerCase());
      if (existing) {
        userId = existing.id;
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
      await supabase.from("user_roles").delete().eq("user_id", userId);
      await supabase.from("user_roles").insert({ user_id: userId, role: a.role === "admin" ? "admin" : "user" });
      results.push({ email: a.email, role: a.role, user_id: userId, status: existing ? "updated" : "created" });
    }

    return jsonResponse(req, { ok: results.every((r) => !r.error), results });
  } catch {
    return jsonResponse(req, { ok: false, error: "Internal server error" }, 500);
  }
});
