import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function queryGemini(query: string, transactions: unknown[]) {
  const apiKey = Deno.env.get("GEMINI_API_KEY");
  if (!apiKey) throw new Error("GEMINI_API_KEY is not configured on your Supabase Secrets");

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
- Transactions List: ${JSON.stringify(transactions)}

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
      contents: [
        {
          role: "user",
          parts: [
            { text: systemInstruction },
            { text: query }
          ]
        }
      ],
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
                  value: { type: "NUMBER", description: "Value of the bar/category" }
                },
                required: ["label", "value"]
              }
            }
          },
          required: ["reply"]
        }
      }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Gemini API returned status ${response.status}: ${errText}`);
  }

  const resData = await response.json();
  const text = resData.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error("Empty response from Gemini.");
  return JSON.parse(text);
}

async function queryGroq(query: string, transactions: unknown[]) {
  const apiKey = Deno.env.get("GROQ_API_KEY");
  if (!apiKey) throw new Error("GROQ_API_KEY is not configured on your Supabase Secrets");

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
- Transactions List: ${JSON.stringify(transactions)}

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
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: systemInstruction },
        { role: "user", content: query }
      ],
      response_format: { type: "json_object" }
    })
  });

  if (!response.ok) {
    const errText = await response.text();
    throw new Error(`Groq API returned status ${response.status}: ${errText}`);
  }

  const resData = await response.json();
  const text = resData.choices?.[0]?.message?.content;
  if (!text) throw new Error("Empty response from Groq.");
  return JSON.parse(text);
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 1. Authenticate user using their own session JWT
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_ANON_KEY")!,
      {
        global: {
          headers: { Authorization: authHeader }
        }
      }
    );

    const { data: { user }, error: authError } = await supabaseClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized user session" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const userId = user.id;

    // 2. Rate Limiting Enforcements using db-backed logs

    // Enforce rate limit (3 messages per minute)
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
      return new Response(
        JSON.stringify({ error: "Rate limit exceeded: Max 3 queries per minute. Please wait." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Enforce daily limit (100 messages per 24 hours)
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
      return new Response(
        JSON.stringify({ error: "Daily limit reached: Max 100 queries per day. Resume tomorrow." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Insert new request log with log_type = 'chat'
    const { error: logErr } = await supabaseClient
      .from("ai_message_logs")
      .insert({ user_id: userId, log_type: "chat" });

    if (logErr) {
      console.error("Failed to insert AI log:", logErr);
    }

    // 4. Extract query and transaction details
    const { query, transactions = [] } = await req.json();
    if (!query) throw new Error("query is required");

    let result = null;
    let usedFallback = false;

    // Try Gemini 2.5 Flash
    try {
      console.log("[Ask-Data] Querying Gemini 2.5 Flash...");
      result = await queryGemini(query, transactions);
    } catch (geminiErr) {
      console.warn("[Ask-Data] Gemini failed, falling back to Groq:", geminiErr);
      usedFallback = true;
    }

    // Fallback to Groq llama-3.1-8b-instant
    if (!result) {
      try {
        console.log("[Ask-Data] Querying Groq Llama 3.1...");
        result = await queryGroq(query, transactions);
      } catch (groqErr) {
        console.error("[Ask-Data] Both Gemini and Groq failed:", groqErr);
        throw new Error(`AI providers exhausted: ${groqErr.message}`);
      }
    }

    if (!result || !result.reply) {
      throw new Error("Failed to produce conversational output.");
    }

    console.log(`[Ask-Data] Success (Fallback used: ${usedFallback})`);
    return new Response(JSON.stringify(result), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });

  } catch (e) {
    console.error("ask-data final error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
