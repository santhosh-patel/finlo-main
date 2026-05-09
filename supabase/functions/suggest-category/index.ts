import { requireAuthUser } from "../_shared/auth.ts";
import { getCorsHeaders, jsonResponse } from "../_shared/cors.ts";

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

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  const authResult = await requireAuthUser(req);
  if (!authResult.ok) return authResult.response;

  try {
    const { note, categories = [] } = await req.json() as { note?: string; categories?: string[] };
    if (!note || typeof note !== "string") return jsonResponse(req, { error: "note is required" }, 400);

    const cleanNote = note.toLowerCase().trim().slice(0, 500);

    for (const [kw, cat] of Object.entries(STATIC_MATCHES)) {
      if (cleanNote.includes(kw)) {
        return jsonResponse(req, { category: cat, source: "static" });
      }
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return jsonResponse(req, { category: "Other", error: "Category service unavailable" }, 503);

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
            content: `You are an expert category suggestions assistant. Given a short transaction note and available categories, pick the single most relevant category.`,
          },
          {
            role: "user",
            content: `Transaction: "${cleanNote.slice(0, 200)}"
Categories: ${JSON.stringify(categoryNames)}`,
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "suggest_category",
            description: "Return suggested category",
            parameters: {
              type: "object",
              properties: { category: { type: "string" } },
              required: ["category"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "suggest_category" } },
      }),
    });

    if (!response.ok) {
      return jsonResponse(req, { category: "Other" }, 200);
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

    return jsonResponse(req, { category, source: "gemini" });
  } catch {
    console.error("suggest-category error");
    return jsonResponse(req, { category: "Other" }, 200);
  }
});
