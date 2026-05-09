import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getCorsHeaders, jsonResponse } from "../_shared/cors.ts";

const MAX_TEXT_CHARS = 800;

async function callGroqWhisper(blob: Blob, model: string, apiKey: string): Promise<string> {
  const formData = new FormData();
  formData.append("file", blob, "recording.webm");
  formData.append("model", model);

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
    },
    body: formData,
  });

  if (!res.ok) {
    await res.text();
    throw new Error("Groq Whisper failed");
  }

  const data = await res.json();
  return data.text || "";
}

async function transcribeAudio(base64Audio: string, mimeType: string, apiKey: string): Promise<string> {
  const binaryString = atob(base64Audio);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) bytes[i] = binaryString.charCodeAt(i);

  const blob = new Blob([bytes], { type: mimeType || "audio/webm" });

  try {
    return await callGroqWhisper(blob, "whisper-large-v3", apiKey);
  } catch {
    return await callGroqWhisper(blob, "whisper-large-v3-turbo", apiKey);
  }
}

async function parseWithGemini(text: string, apiKey: string, today: string, yesterday: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{
          text: `You are an expert NLP parser for a personal finance ledger. Parse a transaction log and return structured fields.
- amount: number (float)
- note: description (string)
- date: YYYY-MM-DD (string)
- category_guess: one of Food, Transport, Utilities, Entertainment, Housing, Medical, Shopping, Tax, Other (string)
- date_explicit: boolean

Reference: Today is ${today}. Yesterday was ${yesterday}.
If date missing, default to today (${today}) and set date_explicit false. If category unclear, use "Other".`,
        }],
      },
      contents: [{ role: "user", parts: [{ text: `Parse this transaction: "${text}"` }] }],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            amount: { type: "NUMBER" },
            note: { type: "STRING" },
            date: { type: "STRING" },
            category_guess: { type: "STRING" },
            date_explicit: { type: "BOOLEAN" },
          },
          required: ["amount", "note", "date", "category_guess", "date_explicit"],
        },
      },
    }),
  });

  if (!response.ok) {
    await response.text();
    throw new Error("Gemini parse failed");
  }

  const resJson = await response.json();
  const generatedText = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!generatedText) throw new Error("No Gemini candidates.");
  return JSON.parse(generatedText);
}

async function parseWithGroqLLM(text: string, apiKey: string, today: string, yesterday: string): Promise<Record<string, unknown>> {
  const prompt = `You are an NLP parser for a personal finance ledger. Return JSON only.
Fields: amount (number), note (string), date (YYYY-MM-DD), category_guess (Food|Transport|Utilities|Entertainment|Housing|Medical|Shopping|Tax|Other), date_explicit (boolean).
Today=${today}, yesterday=${yesterday}. Default date to today if missing.`;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.1-8b-instant",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: `Parse this transaction: "${text}"` },
      ],
      response_format: { type: "json_object" },
      temperature: 0.1,
    }),
  });

  if (!response.ok) {
    await response.text();
    throw new Error("Groq parse failed");
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty Groq response.");
  return JSON.parse(content);
}

function clampText(t: string): string {
  if (t.length <= MAX_TEXT_CHARS) return t;
  return t.slice(0, MAX_TEXT_CHARS);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return jsonResponse(req, { error: "Missing Authorization header" }, 401);

    const url = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY")!;

    const supabaseClient = createClient(url, anonKey, {
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
      .eq("log_type", "voice")
      .gte("created_at", oneMinuteAgo);

    if (minErr) console.error("Voice limit error:", minErr);
    else if (minuteCount !== null && minuteCount >= 3) {
      return jsonResponse(req, { error: "Voice limit exceeded: Max 3 voice inputs per minute. Please wait." }, 429);
    }

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: dailyCount, error: dailyErr } = await supabaseClient
      .from("ai_message_logs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("log_type", "voice")
      .gte("created_at", twentyFourHoursAgo);

    if (dailyErr) console.error("Voice daily limit error:", dailyErr);
    else if (dailyCount !== null && dailyCount >= 100) {
      return jsonResponse(req, { error: "Daily limit reached: Max 100 voice inputs per day." }, 429);
    }

    const { error: logErr } = await supabaseClient
      .from("ai_message_logs")
      .insert({ user_id: userId, log_type: "voice" });

    if (logErr) console.error("Voice log insert failed:", logErr);

    let body: { text?: string; audio?: string; mimeType?: string };
    try {
      body = await req.json();
    } catch {
      return jsonResponse(req, { error: "Invalid JSON" }, 400);
    }

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    let text = (body.text ?? "").trim();
    const audio = body.audio?.trim();
    const mimeType = typeof body.mimeType === "string" ? body.mimeType : "";

    if (audio) {
      if (!GROQ_API_KEY) return jsonResponse(req, { error: "Speech input is unavailable (service not configured)." }, 503);
      text = await transcribeAudio(audio, mimeType, GROQ_API_KEY);
      text = text.trim();
    }

    if (!text) return jsonResponse(req, { error: "text or audio parameter is required" }, 400);
    text = clampText(text);

    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

    let parsedData = null;

    try {
      if (!GEMINI_API_KEY) throw new Error("no gemini");
      parsedData = await parseWithGemini(text, GEMINI_API_KEY, today, yesterday);
    } catch {
      if (!GROQ_API_KEY) {
        return jsonResponse(req, { error: "Parsing service unavailable. Try again later." }, 503);
      }
      try {
        parsedData = await parseWithGroqLLM(text, GROQ_API_KEY, today, yesterday);
      } catch {
        return jsonResponse(req, { error: "Could not parse transaction. Try rephrasing." }, 500);
      }
    }

    if (!parsedData) return jsonResponse(req, { error: "Could not parse transaction." }, 500);

    return jsonResponse(req, { ...parsedData, transcribed_text: text });
  } catch (e) {
    console.error("nl-parse-expense:", e);
    return jsonResponse(req, { error: "Something went wrong. Please try again." }, 500);
  }
});
