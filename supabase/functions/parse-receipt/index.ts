import { requireAuthUser } from "../_shared/auth.ts";
import { getCorsHeaders, jsonResponse } from "../_shared/cors.ts";
import {
  DEFAULT_EXPENSE_CATEGORIES,
  normalizeAmount,
  normalizeCategory,
} from "../_shared/parseNormalize.ts";

const MAX_IMAGE_BASE64_CHARS = 2_400_000;

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: getCorsHeaders(req) });

  const authResult = await requireAuthUser(req);
  if ("response" in authResult) return authResult.response;

  try {
    const body = await req.json() as {
      imageBase64?: string;
      contentType?: string;
      referenceDate?: string;
      expenseCategories?: string[];
    };
    const imageBase64 = body.imageBase64;
    const contentType = typeof body.contentType === "string" ? body.contentType : "image/jpeg";

    if (!imageBase64 || typeof imageBase64 !== "string") {
      return jsonResponse(req, { error: "imageBase64 is required" }, 400);
    }
    if (imageBase64.length > MAX_IMAGE_BASE64_CHARS) {
      return jsonResponse(req, { error: "Image payload too large." }, 413);
    }

    const utcToday = new Date().toISOString().split("T")[0];
    const referenceDate = typeof body.referenceDate === "string" && ISO_DATE.test(body.referenceDate.trim())
      ? body.referenceDate.trim()
      : utcToday;

    const expenseCats = Array.isArray(body.expenseCategories) && body.expenseCategories.length > 0
      ? body.expenseCategories.filter((x): x is string => typeof x === "string" && x.trim().length > 0)
      : [...DEFAULT_EXPENSE_CATEGORIES];

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
            content: `You read receipt and invoice photos for an Indian personal finance app (amounts in INR).

Extract:
- amount: the FINAL total the customer pays (after tax, tips, discounts). Prefer "Grand Total", "Amount Payable", "Net Amount", or the largest bold total—not subtotal or MRP alone.
- merchant: store or payee name (short, no address).
- date: transaction date as YYYY-MM-DD. If only day/month visible, assume current year. If unreadable, use ${referenceDate}.
- category_guess: exactly one of: ${JSON.stringify(expenseCats)}. Pick best fit from merchant and items (grocery store→Groceries, restaurant→Food, fuel station→Travel, utility bill→Bills, etc.).
- items: line items when visible, else []. Each item: name (string), price (number line total if shown).

If multiple totals appear, choose the one labeled as final/payable.`,
          },
          {
            role: "user",
            content: [
              { type: "text", text: "Extract receipt fields as tool call." },
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
              required: ["amount", "merchant", "date", "category_guess"],
            },
          },
        }],
        tool_choice: { type: "function", function: { name: "return_receipt_data" } },
        temperature: 0,
      }),
    });

    if (!response.ok) {
      await response.text();
      return jsonResponse(req, { error: "Could not read receipt. Try again." }, 500);
    }

    const data = await response.json();
    const toolCall = data.choices?.[0]?.message?.tool_calls?.[0];
    let receiptData: Record<string, unknown> | null = null;
    if (toolCall?.function?.arguments) {
      try {
        receiptData = JSON.parse(toolCall.function.arguments) as Record<string, unknown>;
      } catch {
        return jsonResponse(req, { error: "Receipt parse failed" }, 500);
      }
    }

    if (!receiptData) return jsonResponse(req, { error: "No receipt details returned." }, 500);

    let amount = normalizeAmount(receiptData.amount);
    const items = Array.isArray(receiptData.items) ? receiptData.items : [];
    if ((amount == null || amount <= 0) && items.length > 0) {
      const sum = items.reduce((a: number, it: unknown) => {
        if (it && typeof it === "object" && "price" in it) {
          const p = normalizeAmount((it as { price: unknown }).price);
          return a + (p ?? 0);
        }
        return a;
      }, 0);
      if (sum > 0) amount = Math.round(sum * 100) / 100;
    }
    if (amount == null || amount <= 0) {
      return jsonResponse(req, { error: "Could not read a total amount on this receipt." }, 422);
    }

    const merchant = typeof receiptData.merchant === "string"
      ? receiptData.merchant.trim().slice(0, 120)
      : "Receipt";

    let dateStr = typeof receiptData.date === "string" ? receiptData.date.trim() : referenceDate;
    if (!ISO_DATE.test(dateStr)) dateStr = referenceDate;
    if (dateStr > referenceDate) dateStr = referenceDate;

    const category_guess = normalizeCategory(receiptData.category_guess, expenseCats);

    return jsonResponse(req, {
      amount,
      merchant,
      date: dateStr,
      category_guess,
      items,
    });
  } catch {
    console.error("parse-receipt error");
    return jsonResponse(req, { error: "Something went wrong. Try again." }, 500);
  }
});
