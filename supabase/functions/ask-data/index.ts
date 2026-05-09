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

async function queryGemini(query: string, transactions: unknown[]) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY missing");

  const payload = sanitizeTransactions(transactions);
  const systemInstruction = `You are Maya, a friendly and expert financial conversational analysis assistant for the Finlo dashboard application.

CRITICAL SECURITY GUARD RAILS:
1. You are strictly allowed to answer queries related ONLY to the user's personal financial data, transactions ledger array, and dashboard app actions.
2. If the user asks general-knowledge, trivia, coding, history, science, political, or other non-financial/non-dashboard questions, politely but firmly refuse to answer. Say: "I am Maya, your Finlo personal financial assistant. I can only assist with your transaction ledger analysis, saving advice, and financial dashboard calculations."
3. You are fully authorized to answer financial advice questions related to the user's spending habits, such as:
   - "How can I improve my financial habits?"
   - "How can I save more money?"
   - "Where should I be cautious about my spending based on my ledger?"
   - "What are my highest expense areas?"
   - "Suggest a monthly budget plan based on my transactions."
   
Use the following context to answer questions:
- Transactions List: ${JSON.stringify(payload)}

Formatting rules:
- Be highly accurate with sums and arithmetic.
- Use ₹ for currency.
- Highlight patterns, trends, or unusual spikes.
- Keep your reply to 3-4 concise sentences max.
- Optionally, if relevant to visualize the data, return a structured list of data coordinates under 'chartData' to render a chart!`;

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
            reply: { type: "STRING", description: "Conversational financial analysis summary reply" },
            chartData: {
              type: "ARRAY",
              items: {
                type: "OBJECT",
                properties: {
                  label: { type: "STRING", description: "Label of the bar/category" },
                  value: { type: "NUMBER", description: "Value of the bar/category" },
                },
                required: ["label", "value"],
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
  return JSON.parse(text);
}

async function queryGroq(query: string, transactions: unknown[]) {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) throw new Error("GROQ_API_KEY missing");

  const payload = sanitizeTransactions(transactions);
  const systemInstruction = `You are Maya, a friendly and expert financial conversational analysis assistant for the Finlo dashboard application.

CRITICAL SECURITY GUARD RAILS:
1. You are strictly allowed to answer queries related ONLY to the user's personal financial data, transactions ledger array, and dashboard app actions.
2. If the user asks general-knowledge, trivia, coding, history, science, political, or other non-financial/non-dashboard questions, politely but firmly refuse to answer. Say: "I am Maya, your Finlo personal financial assistant. I can only assist with your transaction ledger analysis, saving advice, and financial dashboard calculations."
3. You are fully authorized to answer financial advice questions related to the user's spending habits, such as:
   - "How can I improve my financial habits?"
   - "How can I save more money?"
   - "Where should I be cautious about my spending based on my ledger?"
   - "What are my highest expense areas?"
   - "Suggest a monthly budget plan based on my transactions."
   
Use the following context to answer questions:
- Transactions List: ${JSON.stringify(payload)}

Formatting rules:
- Be highly accurate with sums and arithmetic.
- Use ₹ for currency.
- Highlight patterns, trends, or unusual spikes.
- Keep your reply to 3-4 concise sentences max.
- Optionally, if relevant to visualize the data, return a structured list of data coordinates under 'chartData' to render a chart!

CRITICAL: You MUST return a JSON object with the following exact shape:
{
  "reply": "your analysis text here",
  "chartData": [
    { "label": "Category/Label", "value": 150 }
  ]
}`;

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
  return JSON.parse(text);
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

    let body: { query?: string; transactions?: unknown[] };
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

    let result = null;

    try {
      result = await queryGemini(query, transactions);
    } catch (_) {
      // fall through to Groq
    }

    if (!result) {
      try {
        result = await queryGroq(query, transactions);
      } catch (e) {
        console.error("ask-data both providers failed:", e);
        return jsonResponse(req, { error: "AI assistants are temporarily unavailable. Try again shortly." }, 500);
      }
    }

    if (!result?.reply) {
      return jsonResponse(req, { error: "Unable to produce a reply. Try rephrasing your question." }, 500);
    }

    return jsonResponse(req, result);
  } catch (e) {
    console.error("ask-data error:", e);
    return jsonResponse(req, { error: "Something went wrong. Please try again." }, 500);
  }
});
