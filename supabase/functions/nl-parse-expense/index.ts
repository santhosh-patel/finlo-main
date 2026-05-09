import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { getCorsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  normalizeAmount,
  normalizeCategory,
  noteLooksLikeIncome,
} from "../_shared/parseNormalize.ts";

const MAX_TEXT_CHARS = 1200;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

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

function buildSystemText(
  today: string,
  yesterday: string,
  expenseCats: string[],
  incomeCats: string[],
): string {
  return `You parse short natural-language money logs into JSON for an Indian personal finance app (amounts in INR).

Rules:
- amount: positive number only (total spent or received). Parse:
  - "450", "450.50", "₹1.2k" → 1200, "2k" → 2000, "1.5 lakh" → 150000, "50k" → 50000
  - Strip currency words: rupees, rs, inr, ₹
- note: short merchant or description only (no amount, no date words). Max 120 chars.
- date: YYYY-MM-DD. If user says "today" use ${today}. "Yesterday" → ${yesterday}. Weekday names: infer the most recent past occurrence on or before ${today}. If no date mentioned, use ${today}.
- date_explicit: true if user clearly stated a calendar date or relative day (yesterday, last Friday); false if you defaulted to ${today}.
- category_guess: MUST be exactly one string from the appropriate list below (expense vs income — see income rules).

Expense categories (spending): ${JSON.stringify(expenseCats)}
Income categories (money in): ${JSON.stringify(incomeCats)}

Income vs expense:
- If the user describes money received (salary, freelance payment, refund credited, interest), pick from income categories only.
- Otherwise pick from expense categories only.
- When unsure, treat as expense.

Output only valid JSON matching the schema. No markdown.`;
}

async function parseWithGemini(
  text: string,
  apiKey: string,
  today: string,
  yesterday: string,
  expenseCats: string[],
  incomeCats: string[],
) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      systemInstruction: {
        parts: [{ text: buildSystemText(today, yesterday, expenseCats, incomeCats) }],
      },
      contents: [{ role: "user", parts: [{ text: `Transaction log:\n"""${text}"""` }] }],
      generationConfig: {
        temperature: 0,
        topP: 0.95,
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            amount: { type: "NUMBER" },
            note: { type: "STRING" },
            date: { type: "STRING" },
            category_guess: { type: "STRING" },
            date_explicit: { type: "BOOLEAN" },
            is_income: { type: "BOOLEAN", description: "True if this is money received" },
          },
          required: ["amount", "note", "date", "category_guess", "date_explicit", "is_income"],
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
  return JSON.parse(generatedText) as Record<string, unknown>;
}

async function parseWithGroqLLM(
  text: string,
  apiKey: string,
  today: string,
  yesterday: string,
  expenseCats: string[],
  incomeCats: string[],
): Promise<Record<string, unknown>> {
  const system = `${buildSystemText(today, yesterday, expenseCats, incomeCats)}

Return a single JSON object with keys: amount, note, date, category_guess, date_explicit (boolean), is_income (boolean).`;

  const response = await fetch("https://api.groq.com/openai/v1/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "llama-3.3-70b-versatile",
      messages: [
        { role: "system", content: system },
        { role: "user", content: `Parse:\n"""${text}"""` },
      ],
      response_format: { type: "json_object" },
      temperature: 0,
    }),
  });

  if (!response.ok) {
    await response.text();
    throw new Error("Groq parse failed");
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty Groq response.");
  return JSON.parse(content) as Record<string, unknown>;
}

function clampText(t: string): string {
  if (t.length <= MAX_TEXT_CHARS) return t;
  return t.slice(0, MAX_TEXT_CHARS);
}

function extractAmountFromText(text: string): number | null {
  const m = text.match(/(?:₹|rs\.?\s*|inr\s*)?([\d,]+(?:\.\d+)?)\s*k\b/i);
  if (m) {
    const n = parseFloat(m[1].replace(/,/g, "")) * 1000;
    if (n > 0) return Math.round(n * 100) / 100;
  }
  const m2 = text.match(/(?:₹|rs\.?\s*)?([\d,]+(?:\.\d+)?)/);
  if (m2) {
    const n = parseFloat(m2[1].replace(/,/g, ""));
    if (n > 0) return Math.round(n * 100) / 100;
  }
  return null;
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

    let body: {
      text?: string;
      audio?: string;
      mimeType?: string;
      referenceDate?: string;
      expenseCategories?: string[];
      incomeCategories?: string[];
    };
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

    const utcToday = new Date().toISOString().split("T")[0];
    const referenceDate = typeof body.referenceDate === "string" && ISO_DATE.test(body.referenceDate.trim())
      ? body.referenceDate.trim()
      : utcToday;
    const yesterday = new Date(new Date(referenceDate + "T12:00:00").getTime() - 86400000)
      .toISOString()
      .split("T")[0];

    const expenseCats = Array.isArray(body.expenseCategories) && body.expenseCategories.length > 0
      ? body.expenseCategories.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : [...DEFAULT_EXPENSE_CATEGORIES];
    const incomeCats = Array.isArray(body.incomeCategories) && body.incomeCategories.length > 0
      ? body.incomeCategories.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : [...DEFAULT_INCOME_CATEGORIES];

    let parsedData: Record<string, unknown> | null = null;

    try {
      if (!GEMINI_API_KEY) throw new Error("no gemini");
      parsedData = await parseWithGemini(
        text,
        GEMINI_API_KEY,
        referenceDate,
        yesterday,
        expenseCats,
        incomeCats,
      );
    } catch {
      if (!GROQ_API_KEY) {
        return jsonResponse(req, { error: "Parsing service unavailable. Try again later." }, 503);
      }
      try {
        parsedData = await parseWithGroqLLM(
          text,
          GROQ_API_KEY,
          referenceDate,
          yesterday,
          expenseCats,
          incomeCats,
        );
      } catch {
        return jsonResponse(req, { error: "Could not parse transaction. Try rephrasing." }, 500);
      }
    }

    if (!parsedData) return jsonResponse(req, { error: "Could not parse transaction." }, 500);

    let amount = normalizeAmount(parsedData.amount);
    if (amount == null) {
      amount = extractAmountFromText(text);
    }
    if (amount == null || amount <= 0) {
      return jsonResponse(req, { error: "Could not detect a valid amount. Include a number (e.g. 450 or 1.2k)." }, 422);
    }
    if (amount > 99_999_999) {
      amount = Math.min(amount, 99_999_999);
    }

    const rawNote = typeof parsedData.note === "string" ? parsedData.note.trim() : "";
    const note = rawNote.slice(0, 500) || text.slice(0, 120).trim() || "Transaction";

    const rawD = typeof parsedData.date === "string" ? parsedData.date.trim() : "";
    let date = ISO_DATE.test(rawD) ? rawD : referenceDate;
    let date_explicit = parsedData.date_explicit === true;
    if (!ISO_DATE.test(rawD)) {
      date_explicit = false;
      date = referenceDate;
    } else if (date > referenceDate) {
      date = referenceDate;
      date_explicit = false;
    }

    const modelIncome = parsedData.is_income === true;
    const useIncome = modelIncome || noteLooksLikeIncome(note);
    const pool = useIncome ? incomeCats : expenseCats;
    const category_guess = normalizeCategory(parsedData.category_guess, pool);

    return jsonResponse(req, {
      amount,
      note,
      date,
      category_guess,
      date_explicit,
      is_income: useIncome,
      transcribed_text: text,
    });
  } catch (e) {
    console.error("nl-parse-expense:", e);
    return jsonResponse(req, { error: "Something went wrong. Please try again." }, 500);
  }
});
