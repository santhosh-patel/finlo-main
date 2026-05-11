import { requireAuthUser } from "../_shared/auth.ts";
import { getCorsHeaders, jsonResponse } from "../_shared/cors.ts";
import { normalizeCategory } from "../_shared/parseNormalize.ts";

const STATIC_MATCHES: Record<string, string> = {
  uber: "Travel",
  ola: "Travel",
  auto: "Travel",
  metro: "Travel",
  cab: "Travel",
  taxi: "Travel",
  train: "Travel",
  flight: "Travel",
  petrol: "Travel",
  fuel: "Travel",
  swiggy: "Food",
  zomato: "Food",
  restaurant: "Food",
  dinner: "Food",
  lunch: "Food",
  breakfast: "Food",
  cafe: "Food",
  coffee: "Food",
  groceries: "Groceries",
  supermarket: "Groceries",
  bigbasket: "Groceries",
  blinkit: "Groceries",
  zepto: "Groceries",
  netflix: "Misc",
  spotify: "Misc",
  movie: "Misc",
  theatre: "Misc",
  game: "Misc",
  steam: "Misc",
  rent: "Rent",
  maintenance: "Bills",
  electricity: "Bills",
  water: "Bills",
  wifi: "Bills",
  internet: "Bills",
  gas: "Bills",
  phone: "Bills",
  medical: "Misc",
  doctor: "Misc",
  pharmacy: "Misc",
  medicine: "Misc",
  hospital: "Misc",
  clinic: "Misc",
  amazon: "Shopping",
  myntra: "Shopping",
  clothes: "Shopping",
  flipkart: "Shopping",
  shoes: "Shopping",
  salon: "Salon",
  haircut: "Salon",
  spa: "Salon",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  const authResult = await requireAuthUser(req);
  if ("response" in authResult) return authResult.response;

  try {
    const { note, categories = [] } = await req.json() as { note?: string; categories?: string[] };
    if (!note || typeof note !== "string") return jsonResponse(req, { error: "note is required" }, 400);

    const cleanNote = note.toLowerCase().trim().slice(0, 500);

    const categoryNames = categories.length > 0 ? categories : ["Food", "Groceries", "Travel", "Bills", "Shopping", "Rent", "Misc", "Salon", "Lending", "Hehe", "Salary", "Freelance", "Refund", "Other Income"];

    for (const [kw, cat] of Object.entries(STATIC_MATCHES)) {
      if (cleanNote.includes(kw)) {
        const category = normalizeCategory(cat, categoryNames);
        return jsonResponse(req, { category, source: "static" });
      }
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return jsonResponse(req, { category: "Misc", error: "Category service unavailable" }, 503);

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash-lite",
        temperature: 0,
        messages: [
          {
            role: "system",
            content: `You classify short expense/income notes into ONE category from the user's list only.
Rules:
- Return exactly one string that matches one of the provided categories (case-insensitive ok in reasoning; output must be the canonical name from the list).
- Prefer specific categories (e.g. Groceries vs Food for supermarkets; Travel for cab/metro/fuel; Bills for utilities).`,
          },
          {
            role: "user",
            content: `Note: "${cleanNote.slice(0, 200)}"
Allowed categories (pick one): ${JSON.stringify(categoryNames)}`,
          },
        ],
        tools: [{
          type: "function",
          function: {
            name: "suggest_category",
            description: "Return suggested category exactly from the allowed list",
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
      return jsonResponse(req, { category: normalizeCategory("Misc", categoryNames) }, 200);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    let raw = "Misc";
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        raw = typeof parsed.category === "string" ? parsed.category : "Misc";
      } catch {
        raw = "Misc";
      }
    }

    const category = normalizeCategory(raw, categoryNames);

    return jsonResponse(req, { category, source: "gemini" });
  } catch {
    console.error("suggest-category error");
    return jsonResponse(req, { category: "Misc" }, 200);
  }
});
