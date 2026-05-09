import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getCorsHeaders, jsonResponse } from "../_shared/cors.ts";

const MAX_QUERY_LENGTH = 500;

function redactPII(text: string): string {
  return text
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, "[EMAIL]")
    .replace(/\b\d{10,}\b/g, "[PHONE]");
}

function sanitizeTransactions(transactions: unknown): unknown[] {
  if (!Array.isArray(transactions)) return [];
  return transactions.map((t) => {
    if (t && typeof t === "object" && "note" in t && typeof (t as { note: unknown }).note === "string") {
      return { ...(t as Record<string, unknown>), note: redactPII((t as { note: string }).note) };
    }
    return t;
  });
}

function sanitizeCategoriesForPrompt(categories: unknown): Record<string, unknown>[] {
  if (!Array.isArray(categories)) return [];
  const out: Record<string, unknown>[] = [];
  for (const row of categories) {
    if (out.length >= 100) break;
    if (!row || typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const name = typeof r.name === "string" ? r.name.trim() : "";
    if (!name) continue;
    const subcategories = Array.isArray(r.subcategories)
      ? (r.subcategories as unknown[]).filter((x): x is string => typeof x === "string").slice(0, 15)
      : [];
    const type = typeof r.type === "string" ? r.type : undefined;
    out.push({ name, ...(subcategories.length ? { subcategories } : {}), ...(type ? { type } : {}) });
  }
  return out;
}

function clampDisplayName(raw: string): string | null {
  const s = raw.replace(/\s+/g, " ").trim().slice(0, 64);
  return s.length ? s : null;
}

async function resolveUserDisplayName(
  supabaseClient: ReturnType<typeof createClient>,
  userId: string,
  user: { email?: string | null; user_metadata?: Record<string, unknown> | null },
): Promise<string | null> {
  const { data: prof } = await supabaseClient
    .from("profiles")
    .select("display_name")
    .eq("user_id", userId)
    .maybeSingle();
  const fromProf = typeof prof?.display_name === "string" ? prof.display_name : "";
  const c = clampDisplayName(fromProf);
  if (c) return c;
  const meta = user.user_metadata;
  if (meta && typeof meta === "object") {
    const fn = meta.full_name ?? meta.name;
    if (typeof fn === "string") {
      const c2 = clampDisplayName(fn);
      if (c2) return c2;
    }
  }
  const email = user.email;
  if (email && email.includes("@")) {
    return clampDisplayName(email.split("@")[0] ?? "") ?? null;
  }
  return null;
}

function buildInstructions(
  transactionsPayload: unknown[],
  categoryPayload: Record<string, unknown>[],
  today: string,
  userDisplayName: string | null,
): string {
  const userLine = userDisplayName
    ? `- User's preferred name: ${JSON.stringify(userDisplayName)}. Speak to them directly; use their name occasionally in a natural way (not every sentence).`
    : `- No display name on file; use warm second person ("you") only.`;

  return `You are Maya, a friendly and expert financial conversational analysis assistant for the Finlo dashboard application.

CRITICAL SECURITY GUARD RAILS:
1. You are strictly allowed to answer queries related ONLY to the user's personal financial data, transactions ledger array, and dashboard app actions.
2. If the user asks general-knowledge, trivia, coding, history, science, political, or other non-financial/non-dashboard questions, politely but firmly refuse to answer. Say: "I am Maya, your Finlo personal financial assistant. I can only assist with your transaction ledger analysis, saving advice, and financial dashboard calculations."
3. You are fully authorized to answer financial advice questions related to the user's spending habits AND to STRUCTURE RECORDING INTENT when they want to ADD or SAVE data in Finlo.

Context:
${userLine}
- Today's date (ISO, user app): "${today}". When the user does not specify a date for a NEW transaction, use this date unless they imply another day explicitly.
- Known categories — use EXACT category names below when assigning "category" on a transaction. If none fit and the user names a genuinely new grouping, propose it in categoriesToAdd first so the UI can confirm.
- Categories catalog: ${JSON.stringify(categoryPayload)}
- Transactions ledger (possibly partial): ${JSON.stringify(transactionsPayload)}

RECORDING INTENT (transactions / categories):
- Only when the user asks to RECORD, ADD, LOG, TRACK, SAVE, CREATE, ENTER, BOOK, or REGISTER a NEW transaction, expense, income, payout, REFUND THEY RECEIVED, or a NEW CATEGORY, fill "categoriesToAdd" and/or "transactionsToAdd". Otherwise omit them or leave them empty arrays [].
- For ANALYSIS QUESTIONS ONLY (summaries, trends, comparisons): leave BOTH arrays EMPTY.
- Normalize amounts as numbers without currency symbols. Prefer ₹ (Indian rupees).
- In each transactionsToAdd row use field **txnType** with value "expense" or "income".
- Infer sensible categories ("coffee/lunch/snacks/dinner/Zomato/Swiggy" ⇒ Food unless user specifies otherwise).
- Payment method MUST be exactly one of "upi", "cash", or "card" (default "upi").
- You may propose multiple NEW categories followed by transactions that reference those names — the Finlo UI applies categories first then transactions.

Formatting rules for "reply":
- Be highly accurate with sums and arithmetic.
- Use ₹ in prose.
- Keep your reply to 3-4 concise sentences max for analysis; when you suggested saved changes, briefly list what you'll add and say the user should tap "Add to Finlo" below to confirm.

Optional chart ("chartData"):
- Include only when a chart helps (comparisons, shares). Omit or use empty array if not helpful.`;
}

function pruneAssistantArtifacts(raw: Record<string, unknown>): Record<string, unknown> & {
  categoriesToAdd: unknown[];
  transactionsToAdd: unknown[];
} {
  let categoriesToAdd = Array.isArray(raw.categoriesToAdd) ? raw.categoriesToAdd.slice(0, 10) : [];
  let transactionsToAdd = Array.isArray(raw.transactionsToAdd) ? raw.transactionsToAdd.slice(0, 20) : [];
  categoriesToAdd = categoriesToAdd.filter((x) => x && typeof x === "object");
  transactionsToAdd = transactionsToAdd.filter((x) => x && typeof x === "object");
  const assistant_actions =
    categoriesToAdd.length === 0 && transactionsToAdd.length === 0
      ? undefined
      : { categoriesToAdd, transactionsToAdd };
  const next: Record<string, unknown> = { reply: raw.reply, chartData: raw.chartData };
  if (assistant_actions !== undefined) next.assistant_actions = assistant_actions;
  else next.assistant_actions = null;
  return { ...next, categoriesToAdd, transactionsToAdd } as Record<string, unknown> & {
    categoriesToAdd: unknown[];
    transactionsToAdd: unknown[];
  };
}

async function queryGemini(
  query: string,
  transactions: unknown[],
  categoryPayload: Record<string, unknown>[],
  today: string,
  userDisplayName: string | null,
) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");

  const payload = sanitizeTransactions(transactions);
  const systemInstruction = buildInstructions(payload, categoryPayload, today, userDisplayName);

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      contents: [{
        role: "user",
        parts: [{ text: systemInstruction }, { text: redactPII(query) }],
      }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            reply: { type: "STRING", description: "Conversational reply" },
            chartData: {
              type: "ARRAY",
              description: "Optional chart rows",
              items: {
                type: "OBJECT",
                properties: {
                  label: { type: "STRING" },
                  value: { type: "NUMBER" },
                },
                required: ["label", "value"],
              },
            },
            categoriesToAdd: {
              type: "ARRAY",
              description: "New categories users asked to create; empty unless requested",
              items: {
                type: "OBJECT",
                properties: {
                  name: { type: "STRING" },
                  subcategories: { type: "ARRAY", items: { type: "STRING" } },
                  type: { type: "STRING", description: "\"expense\" or \"income\"" },
                },
                required: ["name"],
              },
            },
            transactionsToAdd: {
              type: "ARRAY",
              description: "transactions to persist after confirmation; empty unless user asked to add/log",
              items: {
                type: "OBJECT",
                properties: {
                  amount: { type: "NUMBER" },
                  category: { type: "STRING" },
                  subcategory: { type: "STRING" },
                  note: { type: "STRING" },
                  date: { type: "STRING", description: "ISO yyyy-mm-dd" },
                  txnType: { type: "STRING", description: "\"expense\" or \"income\"" },
                  payment_method: { type: "STRING", description: "\"upi\" | \"cash\" | \"card\"" },
                },
                required: ["amount", "category", "date", "txnType"],
              },
            },
          },
          required: ["reply"],
        },
      },
    }),
  });

  if (!response.ok) {
    await response.text();
    throw new Error("Gemini failed");
  }

  const resData = await response.json();
  const text = resData.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty Gemini response.");
  const parsed = JSON.parse(text);
  return pruneAssistantArtifacts(parsed as Record<string, unknown>);
}

async function queryGroq(
  query: string,
  transactions: unknown[],
  categoryPayload: Record<string, unknown>[],
  today: string,
  userDisplayName: string | null,
) {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) throw new Error("GROQ_API_KEY missing");

  const payload = sanitizeTransactions(transactions);
  const systemInstruction =
    `${buildInstructions(payload, categoryPayload, today, userDisplayName)}

---

CRITICAL: You MUST return a JSON object with this exact shape:

{
  "reply": string,
  "chartData": [{ "label": string, "value": number }]  // omit or empty array when not charting,
  "categoriesToAdd": [{ "name": string, "subcategories"?: string[], "type"?: "expense" | "income" }]  // only when creating categories,
  "transactionsToAdd": [{
    "amount": number,
    "category": string,
    "subcategory"?: string,
    "note"?: string,
    "date": string,
    "txnType": "expense" | "income",
    "payment_method"?: "upi" | "cash" | "card"
  }]
}

Use EMPTY ARRAYS [] for categoriesToAdd and transactionsToAdd when purely analytical replies.`;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: redactPII(query) },
      ],
      response_format: { type: "json_object" },
    }),
  });

  if (!response.ok) {
    await response.text();
    throw new Error("Groq failed");
  }

  const resData = await response.json();
  const text = resData.choices?.[0]?.message?.content;
  if (!text) throw new Error("Empty Groq response.");
  const parsed = JSON.parse(text);
  return pruneAssistantArtifacts(parsed as Record<string, unknown>);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse(req, { error: "Missing Authorization header" }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

    const supabaseClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) return jsonResponse(req, { error: "Unauthorized user session" }, 401);

    const userId = user.id;

    const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
    const { count: minuteCount, error: minErr } = await supabaseClient
      .from("ai_message_logs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("log_type", "chat")
      .gte("created_at", oneMinuteAgo);

    if (minErr) {
      console.error("Rate limit min count error:", minErr);
    } else if (minuteCount !== null && minuteCount >= 3) {
      return jsonResponse(req, { error: "Rate limit exceeded: Max 3 queries per minute. Please wait." }, 429);
    }

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: dailyCount, error: dailyErr } = await supabaseClient
      .from("ai_message_logs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("log_type", "chat")
      .gte("created_at", twentyFourHoursAgo);

    if (dailyErr) {
      console.error("Rate limit daily count error:", dailyErr);
    } else if (dailyCount !== null && dailyCount >= 100) {
      return jsonResponse(req, { error: "Daily limit reached: Max 100 queries per day. Resume tomorrow." }, 429);
    }

    const { error: logErr } = await supabaseClient
      .from("ai_message_logs")
      .insert({ user_id: userId, log_type: "chat" });

    if (logErr) console.error("Failed to insert AI log:", logErr);

    let body: {
      query?: string;
      transactions?: unknown[];
      categories?: unknown[];
      today?: string;
    };
    try {
      body = await req.json();
    } catch {
      return jsonResponse(req, { error: "Invalid JSON" }, 400);
    }

    const query = (body.query ?? "").trim();
    if (!query) return jsonResponse(req, { error: "query is required" }, 400);
    if (query.length > MAX_QUERY_LENGTH) {
      return jsonResponse(req, { error: `Query too long. Max ${MAX_QUERY_LENGTH} characters.` }, 400);
    }

    const transactions = body.transactions ?? [];
    const categoryPayload = sanitizeCategoriesForPrompt(body.categories ?? []);
    const today = typeof body.today === "string" && /^\d{4}-\d{2}-\d{2}$/.test(body.today)
      ? body.today
      : new Date().toISOString().slice(0, 10);

    const userDisplayName = await resolveUserDisplayName(supabaseClient, userId, user);

    let result = null;

    try {
      result = await queryGemini(query, transactions, categoryPayload, today, userDisplayName);
    } catch (_) {
      // fall through to Groq
    }

    if (!result) {
      try {
        result = await queryGroq(query, transactions, categoryPayload, today, userDisplayName);
      } catch (e) {
        console.error("ask-data both providers failed:", e);
        return jsonResponse(req, { error: "AI assistants are temporarily unavailable. Try again shortly." }, 500);
      }
    }

    if (!result?.reply || typeof result.reply !== "string") {
      return jsonResponse(req, { error: "Unable to produce a reply. Try rephrasing your question." }, 500);
    }

    const { categoriesToAdd, transactionsToAdd, ...rest } = result;
    void categoriesToAdd;
    void transactionsToAdd;

    return jsonResponse(req, rest);
  } catch (e) {
    console.error("ask-data error:", e);
    return jsonResponse(req, { error: "Something went wrong. Please try again." }, 500);
  }
});
