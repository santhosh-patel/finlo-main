import { createClient, type User } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getCorsHeaders } from "./cors.ts";

/** Returns authenticated user or null with optional error Response for JSON API. */
export async function requireAuthUser(req: Request): Promise<
  { ok: true; user: User; supabase: ReturnType<typeof createClient> } | { ok: false; response: Response }
> {
  const cors = getCorsHeaders(req);
  const authHeader = req.headers.get("Authorization");
  if (!authHeader) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      }),
    };
  }

  const url = Deno.env.get("SUPABASE_URL")!;
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

  const supabase = createClient(url, anonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) {
    return {
      ok: false,
      response: new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...cors, "Content-Type": "application/json" },
      }),
    };
  }

  return { ok: true, user, supabase };
}
