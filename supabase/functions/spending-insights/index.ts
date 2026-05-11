import { requireAuthUser } from "../_shared/auth.ts";
import { getCorsHeaders, jsonResponse } from "../_shared/cors.ts";

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  const authResult = await requireAuthUser(req);
  if ("response" in authResult) return authResult.response;

  try {
    const { summary } = await req.json() as { summary?: string };
    if (!summary || typeof summary !== "string") return jsonResponse(req, { error: "summary is required" }, 400);
    const trimmed = summary.trim().slice(0, 8000);

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return jsonResponse(req, { error: "Insights service unavailable" }, 503);

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
            content: `You are a concise financial insights assistant for a personal expense tracker called Finlo. Given monthly spending data, generate 3-4 short, actionable insights. Focus on:
- Top spending category and its share
- Notable trends or changes
- Simple saving tips based on the data
Keep each insight to 1-2 sentences. Use ₹ for currency. Be friendly and direct. DO NOT use emojis. Return as a JSON array of objects with a "text" key.`,
          },
          { role: "user", content: trimmed },
        ],
        tools: [{
          type: "function",
          function: {
            name: "return_insights",
            description: "Return spending insights as structured data",
            parameters: {
              type: "object",
              properties: {
                insights: {
                  type: "array",
                  items: {
                    type: "object",
                    properties: { text: { type: "string" } },
                    required: ["text"],
                    additionalProperties: false,
                  },
                },
              },
              required: ["insights"],
              additionalProperties: false,
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_insights" } },
      }),
    });

    if (!response.ok) {
      const status = response.status;
      if (status === 429) return jsonResponse(req, { error: "Rate limited, please try again later." }, 429);
      if (status === 402) return jsonResponse(req, { error: "Credits exhausted." }, 402);
      await response.text();
      return jsonResponse(req, { error: "AI service unavailable" }, 500);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    let insights: { text?: string }[] = [];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        insights = parsed.insights ?? [];
      } catch {
        insights = [{ text: "Unable to parse insights." }];
      }
    }

    return jsonResponse(req, { insights });
  } catch {
    console.error("spending-insights error");
    return jsonResponse(req, { error: "Something went wrong. Please try again." }, 500);
  }
});
