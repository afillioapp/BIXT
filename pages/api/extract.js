// Server-side route: keeps your ANTHROPIC_API_KEY secret.
// Receives a base64 receipt image, asks Claude to read it, returns structured JSON.

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};

const CATEGORIES = [
  "Meals & Entertainment",
  "Travel",
  "Office Supplies",
  "Software & Subscriptions",
  "Marketing & Advertising",
  "Professional Services",
  "Equipment",
  "Fuel & Vehicle",
  "Other",
];

export default async function handler(req, res) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { imageBase64, mediaType } = req.body || {};
  if (!imageBase64) {
    return res.status(400).json({ error: "Missing imageBase64" });
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return res.status(500).json({ error: "Server missing ANTHROPIC_API_KEY" });
  }

  const prompt = `You are reading a business expense receipt image. Extract the following fields and respond with ONLY raw JSON, no markdown fences, no preamble:

{
  "date": "YYYY-MM-DD (best guess, use receipt date)",
  "place": "merchant / vendor name",
  "total": "final total amount paid, number only, no currency symbol",
  "hst": "HST/GST/tax amount, number only, 0 if none found",
  "currency": "3 letter currency code, guess CAD if unclear",
  "category_suggestion": "pick the single best fit from this exact list: ${CATEGORIES.join(", ")}",
  "notes": "1 short phrase, e.g. 3 items purchased, or client dinner - leave empty string if nothing notable"
}

If a field is unreadable, use your best reasonable guess rather than leaving it blank. Respond with ONLY the JSON object.`;

  try {
    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01",
      },
      body: JSON.stringify({
        model: "claude-sonnet-5",
        max_tokens: 500,
        messages: [
          {
            role: "user",
            content: [
              {
                type: "image",
                source: {
                  type: "base64",
                  media_type: mediaType || "image/jpeg",
                  data: imageBase64,
                },
              },
              { type: "text", text: prompt },
            ],
          },
        ],
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      return res.status(response.status).json({ error: data?.error?.message || "Anthropic API error" });
    }

    const textBlock = (data.content || []).find((b) => b.type === "text");
    const rawText = textBlock ? textBlock.text : "{}";
    const cleaned = rawText.replace(/```json|```/g, "").trim();

    let parsed;
    try {
      parsed = JSON.parse(cleaned);
    } catch (e) {
      return res.status(500).json({ error: "Could not parse Claude's response", raw: rawText });
    }

    return res.status(200).json({ result: parsed, categories: CATEGORIES });
  } catch (err) {
    return res.status(500).json({ error: err.message || "Unknown server error" });
  }
}
