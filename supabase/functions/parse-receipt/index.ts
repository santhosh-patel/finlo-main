import { serve } from "std/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const { imageBase64, contentType = "image/jpeg" } = await req.json();
    if (!imageBase64) throw new Error("imageBase64 is required");

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) throw new Error("LOVABLE_API_KEY is not configured");

    const response = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${LOVABLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          {
            role: "system",
            content: `You are an expert receipt parsing assistant. Extract details from the uploaded receipt image.
Analyze the image and return the structured receipt details:
- amount: total amount as a number (float)
- merchant: name of the store or merchant (string)
- date: transaction date in YYYY-MM-DD format (string)
- category_guess: one of these exact categories: Food, Transport, Utilities, Entertainment, Housing, Medical, Shopping, Tax, Other (string)
- items: array of items on the receipt, each with a "name" (string) and "price" (number). If items cannot be extracted, return an empty array.

Be extremely precise with amounts and prices. Return only JSON matching the schema.`,
          },
          {
            role: "user",
            content: [
              {
                type: "text",
                text: "Extract the details of this receipt."
              },
              {
                type: "image_url",
                image_url: {
                  url: `data:${contentType};base64,${imageBase64}`
                }
              }
            ]
          }
        ],
        tools: [
          {
            type: "function",
            function: {
              name: "return_receipt_data",
              description: "Return extracted receipt data",
              parameters: {
                type: "object",
                properties: {
                  amount: { type: "number" },
                  merchant: { type: "string" },
                  date: { type: "string" },
                  category_guess: { type: "string" },
                  items: {
                    type: "array",
                    items: {
                      type: "object",
                      properties: {
                        name: { type: "string" },
                        price: { type: "number" }
                      },
                      required: ["name", "price"]
                    }
                  }
                },
                required: ["amount", "merchant", "date", "category_guess", "items"]
              }
            }
          }
        ],
        tool_choice: { type: "function", function: { name: "return_receipt_data" } }
      })
    });

    if (!response.ok) {
      const status = response.status;
      const errorText = await response.text();
      console.error("AI Gateway parse error:", status, errorText);
      return new Response(JSON.stringify({ error: `AI Gateway returned error ${status}` }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" }
      });
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    let receiptData = null;
    if (toolCall?.function?.arguments) {
      try {
        receiptData = JSON.parse(toolCall.function.arguments);
      } catch {
        throw new Error("Unable to parse receipt details.");
      }
    }

    if (!receiptData) {
      throw new Error("AI did not return structured receipt details.");
    }

    return new Response(JSON.stringify(receiptData), {
      headers: { ...corsHeaders, "Content-Type": "application/json" }
    });
  } catch (e) {
    console.error("parse-receipt error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Unknown error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
