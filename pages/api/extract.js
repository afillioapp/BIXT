// Server-side route: keeps your ANTHROPIC_API_KEY secret.
// Receives a base64 receipt image, asks Claude to read it, returns structured JSON.
//
// Access control: callers must present a Firebase ID token (proof of a
// signed-in BX user) in the Authorization header. Without this, the endpoint
// would be an open proxy to the Anthropic API on our bill.

import { createRemoteJWKSet, jwtVerify } from "jose";

export const config = {
  api: {
    bodyParser: {
      sizeLimit: "10mb",
    },
  },
};

// Firebase signs ID tokens with Google-hosted keys; verifying against them
// needs no service-account secret on our side.
const FIREBASE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

// Returns the caller's Firebase user id, or null if the token is missing/bad.
async function verifyCaller(req) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;
  if (!token) return null;
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId) return null;
  try {
    const { payload } = await jwtVerify(token, FIREBASE_JWKS, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
    });
    return payload.sub || null;
  } catch {
    return null;
  }
}

// Per-user scan budget. In-memory, so each serverless instance counts
// separately — coarse, but enough to keep any single account from burning
// meaningful API spend.
const RATE_LIMIT = 30; // scans
const RATE_WINDOW_MS = 60 * 60 * 1000; // per hour
const usageByUid = new Map();

function overRateLimit(uid) {
  const now = Date.now();
  const recent = (usageByUid.get(uid) || []).filter((t) => now - t < RATE_WINDOW_MS);
  if (recent.length >= RATE_LIMIT) {
    usageByUid.set(uid, recent);
    return true;
  }
  recent.push(now);
  usageByUid.set(uid, recent);
  return false;
}

// A receipt photo is compressed to ~200KB client-side before upload; anything
// wildly larger than that is not a legitimate request from our app.
const MAX_IMAGE_BASE64_CHARS = 7 * 1024 * 1024; // ~5MB of image data

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

  const uid = await verifyCaller(req);
  if (!uid) {
    return res.status(401).json({ error: "Please sign in again to scan receipts." });
  }
  if (overRateLimit(uid)) {
    return res.status(429).json({ error: "Too many scans in the last hour. Please try again later." });
  }

  const { imageBase64, mediaType } = req.body || {};
  if (!imageBase64) {
    return res.status(400).json({ error: "Missing imageBase64" });
  }
  if (typeof imageBase64 !== "string" || imageBase64.length > MAX_IMAGE_BASE64_CHARS) {
    return res.status(413).json({ error: "Image is too large." });
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
