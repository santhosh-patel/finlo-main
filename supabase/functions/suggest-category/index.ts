import { serve } from "std/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const STATIC_MATCHES: Record<string, string> = {
  uber: "Transport",
  ola: "Transport",
  auto: "Transport",
  metro: "Transport",
  cab: "Transport",
  taxi: "Transport",
  train: "Transport",
  flight: "Transport",
  swiggy: "Food",
  zomato: "Food",
  restaurant: "Food",
  dinner: "Food",
  lunch: "Food",
  breakfast: "Food",
  cafe: "Food",
  coffee: "Food",
  groceries: "Food",
  supermarket: "Food",
  netflix: "Entertainment",
  spotify: "Entertainment",
  movie: "Entertainment",
  theatre: "Entertainment",
  game: "Entertainment",
  steam: "Entertainment",
  rent: "Housing",
  maintenance: "Housing",
  electricity: "Utilities",
  water: "Utilities",
  wifi: "Utilities",
  internet: "Utilities",
  gas: "Utilities",
  medical: "Medical",
  doctor: "Medical",
  pharmacy: "Medical",
  medicine: "Medical",
  hospital: "Medical",
  clinic: "Medical",
  amazon: "Shopping",
  myntra: "Shopping",
  clothes: "Shopping",
  flipkart: "Shopping",
  shoes: "Shopping",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { note, categories = [] } = await req.json();
    if (!note) throw new Error("note is required");

    const cleanNote = note.toLowerCase().trim();

    // 1. Static fast matching
    for (const [kw, cat] of Object.entries(STATIC_MATCHES)) {
      if (cleanNote.includes(kw)) {
        return new Response(JSON.stringify({ category: cat, source: "static" }), {
          headers: { ...corsHeaders, "Content-Type": "application/json" }
        });
      }
    }

    // 2. Fallback to Gemini
    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const categoryNames = categories.length > 0 ? categories : ["Food", "Transport", "Utilities", "Entertainment", "Housing", "Medical", "Shopping", "Tax", "Other"];

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        messages: [
          {
            role: "system",
            content: `You are an expert category suggestions assistant. Given a short transaction description/note and a list of available categories, choose the single most relevant category.
If no specific category fits well, default to "Other". Only return JSON with a "category" key matching one of the categories.`,
          },
          {
            role: "user",
            content: `Transaction: "${note}"
Categories: ${JSON.stringify(categoryNames)}`,
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "suggest_category",
              description: "Return suggested category details",
              parameters: {
                type: "object",
                properties: {
                  category: { type: "string" }
                },
                required: ["category"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "suggest_category" } }
      })
    });

    if (!response.ok) {
      throw new Error(`AI Gateway error: ${response.status}`);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    let category = "Other";
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        category = parsed.category ?? "Other";
      } catch {
        category = "Other";
      }
    }

    return new Response(JSON.stringify({ category, source: "gemini" }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e) {
    console.error("suggest-category error:", e);
    return new Response(
      JSON.stringify({ category: "Other", error: e instanceof Error ? e.message : "Unknown error" }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
