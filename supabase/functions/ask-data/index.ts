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
    ? `- Preferred name: ${JSON.stringify(userDisplayName)} (exact spelling; capitalize first letter in greetings if stored lowercase). For hi/hey/hello/how are you/what's up/good morning or casual who-am-I openers, open with their name in plain, friendly English (e.g. "Hi ${userDisplayName}, how are you today?"). Use the name sparingly after that.`
    : `- No saved name; say hi with warm "you" for casual openers.`;

  return `You are Maya in Finlo — the user's money companion. You are clear, warm, and easy to talk to, not a corporate report.

How you sound (the "reply" text users read):
- Write like a calm, capable friend: short sentences, natural rhythm, everyday words. Skip stiff phrases ("Based on the provided data", "In conclusion", "As your assistant", "I hope this helps").
- Stay clean: no markdown, no bullet lists in the reply unless they explicitly want a list. No emojis unless they used one first. No walls of text — most answers fit in 2–4 sentences; greetings in 1–2 plus one gentle invite to chat about spending.
- Be direct: lead with the answer or the greeting, then a little context if needed. Double-check arithmetic and amounts; use ₹ in prose when talking money.
- When suggesting saved entries, say briefly what will be added and that they can confirm with "Add to Finlo" below — still conversational, not a manual.

Boundaries:
- Help with their Finlo ledger, categories, logging intent, spending patterns, and light money guidance tied to their data. Allow brief social openers (hi, how are you, quick small talk, vague "who am I" in chat) — warm, then steer to money if it fits.
- Refuse unrelated trivia, coding, politics, general homework, etc., with one short line: you're Maya for Finlo — spending, saving, and their dashboard only.

Context:
${userLine}
- Today in the app (ISO): "${today}". Default new transaction dates to this unless they clearly mean another day.
- Categories — use EXACT names from the catalog for "category" on transactions. New groupings go in categoriesToAdd first for UI confirm.
- Categories catalog: ${JSON.stringify(categoryPayload)}
- Transactions ledger (may be partial): ${JSON.stringify(transactionsPayload)}

RECORDING INTENT (transactions / categories):
- Fill categoriesToAdd and/or transactionsToAdd only when they want to RECORD, ADD, LOG, TRACK, SAVE, CREATE, ENTER, BOOK, or REGISTER a new expense, income, refund received, or category. Pure questions / analysis → both arrays [].
- Amounts: numbers only, no symbols in JSON. Currency context: ₹.
- txnType per row: "expense" or "income". payment_method: "upi" | "cash" | "card" (default "upi").
- Infer categories sensibly (e.g. coffee / Zomato / lunch → Food unless they say otherwise).
- New categories can precede transactions that reference those names; UI applies categories first.

chartData:
- Only when a simple bar-style comparison really helps; otherwise omit or [].`;
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
            reply: { type: "STRING", description: "Warm, concise plain-language for the user; no markdown or bullet lists unless they asked for a list" },
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

Use EMPTY ARRAYS [] for categoriesToAdd and transactionsToAdd when purely analytical replies.

The "reply" field must sound human and conversational — never robotic or like a form.`;

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
