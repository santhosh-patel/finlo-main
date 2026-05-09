import { requireAuthUser } from "../_shared/auth.ts";
import { getCorsHeaders, jsonResponse } from "../_shared/cors.ts";

const MAX_IMAGE_BASE64_CHARS = 2_400_000;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  const authResult = await requireAuthUser(req);
  if (!authResult.ok) return authResult.response;

  try {
    const body = await req.json() as { imageBase64?: string; contentType?: string };
    const imageBase64 = body.imageBase64;
    const contentType = typeof body.contentType === "string" ? body.contentType : "image/jpeg";

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return jsonResponse(req, { error: "imageBase64 is required" }, 400);
    }
    if (imageBase64.length > MAX_IMAGE_BASE64_CHARS) {
      return jsonResponse(req, { error: "Image payload too large." }, 413);
    }

    const LOVABLE_API_KEY = Deno.env.get("LOVABLE_API_KEY");
    if (!LOVABLE_API_KEY) return jsonResponse(req, { error: "Receipt service unavailable" }, 503);

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
            content: `Extract receipt fields: amount (number), merchant (string), date (YYYY-MM-DD), category_guess (Food|Transport|Utilities|Entertainment|Housing|Medical|Shopping|Tax|Other), items[{name, price}].
Return structured data via tool only.`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract the details of this receipt." },
              { type: "image_url", image_url: { url: `data:${contentType};base64,${imageBase64}` } },
            ],
          },
        ],
        tools: [{
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
                    properties: { name: { type: "string" }, price: { type: "number" } },
                    required: ["name", "price"],
                  },
                },
              },
              required: ["amount", "merchant", "date", "category_guess", "items"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_receipt_data" } },
      }),
    });

    if (!response.ok) {
      await response.text();
      return jsonResponse(req, { error: "Could not read receipt. Try again." }, 500);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    let receiptData = null;
    if (toolCall?.function?.arguments) {
      try {
        receiptData = JSON.parse(toolCall.function.arguments);
      } catch {
        return jsonResponse(req, { error: "Receipt parse failed" }, 500);
      }
    }

    if (!receiptData) return jsonResponse(req, { error: "No receipt details returned." }, 500);

    return jsonResponse(req, receiptData);
  } catch {
    console.error("parse-receipt error");
    return jsonResponse(req, { error: "Something went wrong. Try again." }, 500);
  }
});
