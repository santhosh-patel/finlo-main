/** CORS for Edge Functions. Set ALLOWED_ORIGINS to comma-separated list (e.g. https://app.example.com,http://localhost:8080). If unset, allows * (dev only). */

const DEFAULT_ALLOW_HEADERS =
  "authorization, x-client-info, apikey, content-type, x-seed-bootstrap-secret, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version";

export function getCorsHeaders(req: Request): Record<string, string> {
  const raw = Deno.env.get("ALLOWED_ORIGINS");
  const allowed = raw?.split(",").map((s) => s.trim()).filter(Boolean) ?? [];
  const origin = req.headers.get("Origin") ?? "";

  if (allowed.length === 0) {
    return {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": DEFAULT_ALLOW_HEADERS,
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    };
  }

  const allowOrigin = origin && allowed.includes(origin) ? origin : allowed[0] ?? "";
  return {
    "Access-Control-Allow-Origin": allowOrigin,
    "Access-Control-Allow-Headers": DEFAULT_ALLOW_HEADERS,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    Vary: "Origin",
  };
}

export function jsonResponse(req: Request, body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...getCorsHeaders(req), "Content-Type": "application/json" },
  });
}
