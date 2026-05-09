// One-shot seed: Edge Function secrets `SEED_ADMINS` = JSON array of { email, password, name, role: "admin" }.
//
// This function ONLY seeds the admin role. Regular users must be added via Admin → Add user;
// non-admin entries in SEED_ADMINS are rejected.
//
// Two ways to invoke:
// 1) Logged-in user with JWT + `role=admin`.
// 2) First-install bootstrap: headers `Authorization: Bearer <anon key>` and `x-seed-bootstrap-secret: <matches SEED_BOOTSTRAP_SECRET>`.
//    Allowed only while `user_roles` has ZERO `admin` rows (prevents takeover after admins exist).

import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getCorsHeaders, jsonResponse } from "../_shared/cors.ts";

type SeedRole = "admin";

interface SeedEntry {
  email: string;
  password: string;
  name: string;
  role: SeedRole;
}

/** Minimal auth user shape from `auth.admin.listUsers` (explicit type so `[]` is not inferred as `never[]`). */
type ListedAuthUser = { id: string; email?: string | null };

async function runSeedAdmins(
  supabase: SupabaseClient,
  ADMINS: SeedEntry[],
): Promise<Array<{ email: string; role: string; user_id?: string; status?: string; error?: string }>> {
  const users: ListedAuthUser[] = [];
  for (let page = 1; page <= 20; page += 1) {
    const { data: list, error } = await supabase.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw new Error("Failed to list users");
    users.push(...(list.users ?? []));
    if ((list.users ?? []).length < 1000) break;
  }
  const results: Array<{ email: string; role: string; user_id?: string; status?: string; error?: string }> = [];

  for (const a of ADMINS) {
    if (!a.email || !a.password || !a.name || !a.role) {
      results.push({
        email: String(a.email ?? "?"),
        role: String(a.role ?? "?"),
        error: "Missing email, password, name, or role",
      });
      continue;
    }
    if (a.role !== "admin") {
      results.push({
        email: a.email,
        role: String(a.role),
        error: "seed-admin only seeds admin role — add regular users via Admin → Add user",
      });
      continue;
    }
    let userId: string | null = null;
    const existing = users.find((u) => u.email?.toLowerCase() === a.email.toLowerCase());
    if (existing) {
      const id = existing.id;
      userId = id ?? null;
      if (!userId) {
        results.push({ email: a.email, role: a.role, error: "Auth user missing id" });
        continue;
      }
      const { error } = await supabase.auth.admin.updateUserById(userId, {
        password: a.password,
        email_confirm: true,
        user_metadata: { display_name: a.name },
      });
      if (error) {
        results.push({
          email: a.email,
          role: a.role,
          user_id: userId,
          error: error.message,
        });
        continue;
      }
    } else {
      const { data: created, error } = await supabase.auth.admin.createUser({
        email: a.email,
        password: a.password,
        email_confirm: true,
        user_metadata: { display_name: a.name },
      });
      if (error) {
        results.push({ email: a.email, role: a.role, error: error.message });
        continue;
      }
      userId = created?.user?.id ?? null;
    }

    if (!userId) {
      results.push({ email: a.email, role: a.role, error: "Missing auth user id" });
      continue;
    }

    await supabase.from("profiles").upsert(
      { user_id: userId, email: a.email, display_name: a.name },
      { onConflict: "user_id" },
    );
    await supabase.from("user_roles").delete().eq("user_id", userId);
    await supabase.from("user_roles").insert({
      user_id: userId,
      role: "admin",
    });
    results.push({
      email: a.email,
      role: a.role,
      user_id: userId,
      status: existing ? "updated" : "created",
    });
  }
  return results;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: getCorsHeaders(req) });

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) {
      return jsonResponse(req, { ok: false, error: "Function env missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY" }, 500);
    }
    const svcClient = createClient(url, serviceKey);

    const raw = Deno.env.get("SEED_ADMINS");
    let ADMINS: SeedEntry[] = [];
    if (raw) {
      const trimmed = raw.trim();
      if (!trimmed.startsWith("[")) {
        return jsonResponse(
          req,
          {
            ok: false,
            error:
              `SEED_ADMINS must be a single-line JSON array starting with [. First characters look wrong (got: ${JSON.stringify(trimmed.slice(0, 48))}…). Fix in Dashboard → Edge Functions → seed-admin secrets.`,
          },
          400,
        );
      }
      try {
        ADMINS = JSON.parse(trimmed) as SeedEntry[];
      } catch (e) {
        const parseHint = e instanceof Error ? e.message : String(e);
        return jsonResponse(
          req,
          {
            ok: false,
            error:
              `SEED_ADMINS is not valid JSON (${parseHint}). Example: [{"email":"admin@finlo.com","password":"…","name":"Admin","role":"admin"}]`,
          },
          400,
        );
      }
    }
    if (!Array.isArray(ADMINS) || ADMINS.length === 0) {
      return jsonResponse(req, { ok: false, error: "SEED_ADMINS secret is not configured" }, 400);
    }

    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
    const bootstrapSecret = Deno.env.get("SEED_BOOTSTRAP_SECRET");
    const bootstrapHdr = req.headers.get("x-seed-bootstrap-secret") ?? "";

    let allowed = false;
    let bootstrap = false;

    if (bootstrapSecret && bootstrapHdr === bootstrapSecret) {
      let count: number | null = null;
      let cntErr: { message: string } | null = null;
      try {
        const res = await svcClient
          .from("user_roles")
          .select("*", { count: "exact", head: true })
          .eq("role", "admin");
        count = res.count ?? null;
        cntErr = res.error;
      } catch (e) {
        const msg = e instanceof Error ? e.message : String(e);
        return jsonResponse(
          req,
          {
            ok: false,
            error:
              `Admin-count check failed (often migrations missing or DB unreachable): ${msg}`,
          },
          500,
        );
      }
      if (cntErr) return jsonResponse(req, { ok: false, error: cntErr.message || "Could not verify admin count" }, 500);
      if (count !== null && count > 0) {
        return jsonResponse(
          req,
          { ok: false, error: "Bootstrap disabled: project already has an admin — sign in as admin or remove bootstrap secret exposure" },
          403,
        );
      }
      allowed = true;
      bootstrap = true;
    }

    if (!allowed) {
      if (!anonKey) {
        return jsonResponse(req, { ok: false, error: "Missing SUPABASE_ANON_KEY / SUPABASE_PUBLISHABLE_KEY in function env" }, 500);
      }
      const authHeader = req.headers.get("Authorization") ?? "";
      const userClient = createClient(url, anonKey, { global: { headers: { Authorization: authHeader } } });
      const { data: userResp, error: userErr } = await userClient.auth.getUser();
      if (userErr || !userResp.user) return jsonResponse(req, { error: "Unauthorized" }, 401);

      const { data: isAdmin } = await svcClient.rpc("has_role", { _user_id: userResp.user.id, _role: "admin" });
      if (!isAdmin) return jsonResponse(req, { error: "Forbidden" }, 403);
      allowed = true;
    }

    if (!allowed) return jsonResponse(req, { error: "Forbidden" }, 403);

    const results = await runSeedAdmins(svcClient, ADMINS);
    return jsonResponse(req, {
      ok: results.every((r) => !r.error),
      results,
      ...(bootstrap ? { bootstrap: true } : {}),
    });
  } catch (e) {
    console.error("seed-admin", e);
    const msg = e instanceof Error ? e.message : String(e);
    const looksLikeHtml =
      msg.includes("Unexpected token") ||
      msg.includes("Internal Server Error") ||
      msg.includes("DOCTYPE");
    return jsonResponse(
      req,
      {
        ok: false,
        error: looksLikeHtml
          ? "Supabase returned a non-JSON error (paused project, bad URL/key, or network). Check Dashboard project status and redeploy seed-admin."
          : msg || "Internal server error",
      },
      500,
    );
  }
});
