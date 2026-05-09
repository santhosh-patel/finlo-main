import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.8";
// eslint-disable-next-line @typescript-eslint/no-explicit-any
declare const Deno: any;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

async function callGroqWhisper(blob: Blob, model: string, apiKey: string): Promise<string> {
  const formData = new FormData();
  formData.append("file", blob, "recording.webm");
  formData.append("model", model);

  const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${apiKey}`
    },
    body: formData
  });

  if (!res.ok) {
    throw new Error(`Groq Whisper API returned ${res.status}: ${await res.text()}`);
  }

  const data = await res.json();
  return data.text || "";
}

async function transcribeAudio(base64Audio: string, mimeType: string, apiKey: string): Promise<string> {
  // Decode base64 to binary bytes natively in Deno
  const binaryString = atob(base64Audio);
  const len = binaryString.length;
  const bytes = new Uint8Array(len);
  for (let i = 0; i < len; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }

  const blob = new Blob([bytes], { type: mimeType || "audio/webm" });

  try {
    console.log("Attempting transcription with Groq whisper-large-v3...");
    return await callGroqWhisper(blob, "whisper-large-v3", apiKey);
  } catch (err) {
    console.warn("Groq whisper-large-v3 failed, trying whisper-large-v3-turbo...", err);
    try {
      return await callGroqWhisper(blob, "whisper-large-v3-turbo", apiKey);
    } catch (err2) {
      console.error("All Groq Whisper models failed:", err2);
      throw new Error("Speech-to-text transcription failed.");
    }
  }
}

async function parseWithGemini(text: string, apiKey: string, today: string, yesterday: string) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;
  const response = await fetch(url, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      systemInstruction: {
        parts: [
          {
            text: `You are an expert NLP parser for a personal finance ledger. Your task is to parse a text query representing a transaction log and return structured fields.
The fields to extract are:
- amount: number (float)
- note: description of the expense or merchant (string)
- date: transaction date in YYYY-MM-DD format (string)
- category_guess: one of: Food, Transport, Utilities, Entertainment, Housing, Medical, Shopping, Tax, Other (string)
- date_explicit: boolean (true if the user explicitly specified a date in their log, e.g. "yesterday", "on Monday", "May 5th", etc. False if they did not mention any date or time indicator at all).

Reference point: Today is ${today}. Yesterday was ${yesterday}.
If some fields are missing (like date), default to today (${today}) and set date_explicit to false. If category cannot be guessed, default to "Other".`
          }
        ]
      },
      contents: [
        {
          role: "user",
          parts: [{ text: `Parse this transaction: "${text}"` }]
        }
      ],
      generationConfig: {
        responseMimeType: "application/json",
        responseSchema: {
          type: "OBJECT",
          properties: {
            amount: { type: "NUMBER" },
            note: { type: "STRING" },
            date: { type: "STRING" },
            category_guess: { type: "STRING" },
            date_explicit: { type: "BOOLEAN" }
          },
          required: ["amount", "note", "date", "category_guess", "date_explicit"]
        }
      }
    })
  });

  if (!response.ok) {
    throw new Error(`Gemini API error: ${response.status} ${await response.text()}`);
  }

  const resJson = await response.json();
  const generatedText = resJson.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!generatedText) throw new Error("No candidates received from Gemini.");
  return JSON.parse(generatedText);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function parseWithGroqLLM(text: string, apiKey: string, today: string, yesterday: string): Promise<any> {
  const prompt = `You are an expert NLP parser for a personal finance ledger. Your task is to parse a text query representing a transaction log and return structured fields.
The fields to extract are:
- amount: number (float)
- note: description of the expense or merchant (string)
- date: transaction date in YYYY-MM-DD format (string)
- category_guess: one of: Food, Transport, Utilities, Entertainment, Housing, Medical, Shopping, Tax, Other (string)
- date_explicit: boolean (true if the user explicitly specified a date in their log, e.g. "yesterday", "on Monday", "May 5th", etc. False if they did not mention any date or time indicator at all).

Reference point: Today is ${today}. Yesterday was ${yesterday}.
If some fields are missing (like date), default to today (${today}) and set date_explicit to false. If category cannot be guessed, default to "Other".

You MUST respond with a valid raw JSON object matching this structure:
{
  "amount": number,
  "note": "string",
  "date": "YYYY-MM-DD",
  "category_guess": "string",
  "date_explicit": boolean
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
        { role: "system", content: prompt },
        { role: "user", content: `Parse this transaction: "${text}"` }
      ],
      response_format: { type: "json_object" },
      temperature: 0.1
    })
  });

  if (!response.ok) {
    throw new Error(`Groq LLM returned status ${response.status}: ${await response.text()}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) throw new Error("Empty response from Groq LLM.");
  return JSON.parse(content);
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing Authorization header" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    // 1. Authenticate user session using JWT
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

    // 2. Enforce database rate limiting (3 queries/minute and 100 queries/day) for voice inputs
    const oneMinuteAgo = new Date(Date.now() - 60000).toISOString();
    const { count: minuteCount, error: minErr } = await supabaseClient
      .from("ai_message_logs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("log_type", "voice")
      .gte("created_at", oneMinuteAgo);

    if (minErr) {
      console.error("Voice limit min count error:", minErr);
    } else if (minuteCount !== null && minuteCount >= 3) {
      return new Response(
        JSON.stringify({ error: "Voice limit exceeded: Max 3 voice inputs per minute. Please wait." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const twentyFourHoursAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    const { count: dailyCount, error: dailyErr } = await supabaseClient
      .from("ai_message_logs")
      .select("*", { count: "exact", head: true })
      .eq("user_id", userId)
      .eq("log_type", "voice")
      .gte("created_at", twentyFourHoursAgo);

    if (dailyErr) {
      console.error("Voice limit daily count error:", dailyErr);
    } else if (dailyCount !== null && dailyCount >= 100) {
      return new Response(
        JSON.stringify({ error: "Daily limit reached: Max 100 voice inputs per day." }),
        { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 3. Log voice entry in ai_message_logs
    const { error: logErr } = await supabaseClient
      .from("ai_message_logs")
      .insert({ user_id: userId, log_type: "voice" });

    if (logErr) {
      console.error("Failed to insert voice log:", logErr);
    }

    const GROQ_API_KEY = Deno.env.get("GROQ_API_KEY");
    const GEMINI_API_KEY = Deno.env.get("GEMINI_API_KEY");

    // 1. If audio base64 is provided, transcribe with Groq Whisper fallback models
    if (audio) {
      if (!GROQ_API_KEY) {
        throw new Error("GROQ_API_KEY is required to transcribe audio logs.");
      }
      text = await transcribeAudio(audio, mimeType, GROQ_API_KEY);
      console.log("Audio transcribed successfully:", text);
    }

    if (!text) throw new Error("text or audio parameter is required");

    const today = new Date().toISOString().split("T")[0];
    const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

    let parsedData = null;

    // 2. Try parsing structured details using Gemini API
    try {
      if (!GEMINI_API_KEY) throw new Error("GEMINI_API_KEY is not configured");
      parsedData = await parseWithGemini(text, GEMINI_API_KEY, today, yesterday);
    } catch (geminiError) {
      console.warn("Gemini parsing failed, trying Groq LLM fallback...", geminiError);
      if (GROQ_API_KEY) {
        try {
          parsedData = await parseWithGroqLLM(text, GROQ_API_KEY, today, yesterday);
        } catch (groqError) {
          console.error("All structured parsing models failed:", groqError);
          throw new Error("Transaction parser model failed.");
        }
      } else {
        throw geminiError;
      }
    }

    if (!parsedData) {
      throw new Error("Could not parse transaction.");
    }

    // Attach transcribed text so client knows what was transcribed
    return new Response(JSON.stringify({ ...parsedData, transcribed_text: text }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e) {
    console.error("nl-parse-expense error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
