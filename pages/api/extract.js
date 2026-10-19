// Server-side route: reads a receipt photo and returns structured fields.
//
// Recognition runs on our own OCR service (local PP-OCRv4 ONNX inference, see
// ocr-service/), not a paid AI API — a scan costs nothing per use. This route
// stays in front of it because it owns the things the OCR service should not:
// proving the caller is a signed-in BX user, and rate limiting.
//
// Access control: callers must present a Firebase ID token in the
// Authorization header. Without this, the endpoint would be an open proxy to
// our OCR compute.

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
// separately — coarse, but enough to keep any single account from pinning
// the OCR service.
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

// Recognition is ~0.5s warm, but a cold service instance has to load the
// models first, so allow generous headroom before giving up.
const OCR_TIMEOUT_MS = 60 * 1000;

// The official v1 category list (owner-approved 2026-07-08). These names are
// written into users' expense sheets — treat them as a stable schema: add new
// ones if needed, but don't rename existing ones (old rows keep old strings;
// lib/insights.js carries legacy aliases for pre-v1 names).
//
// ocr-service/bx_ocr/categories.py must carry the identical list; its test
// suite asserts the two stay in step.
const CATEGORIES = [
  "Dining & Meals",
  "Coffee & Drinks",
  "Travel",
  "Ground Transport",
  "Fuel",
  "Accommodation",
  "Office & Supplies",
  "Software & Tech",
  "Marketing",
  "Professional Services",
  "Meetings & Events",
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

  const serviceUrl = process.env.OCR_SERVICE_URL;
  const sharedSecret = process.env.OCR_SHARED_SECRET;
  if (!serviceUrl || !sharedSecret) {
    return res.status(500).json({ error: "Server missing OCR_SERVICE_URL or OCR_SHARED_SECRET" });
  }

  const abort = new AbortController();
  const timer = setTimeout(() => abort.abort(), OCR_TIMEOUT_MS);

  try {
    const response = await fetch(serviceUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-bx-ocr-secret": sharedSecret,
      },
      body: JSON.stringify({ imageBase64, mediaType }),
      signal: abort.signal,
    });

    const data = await response.json().catch(() => null);

    if (!response.ok) {
      return res
        .status(response.status === 401 ? 500 : response.status)
        .json({ error: data?.error || "Could not read the receipt." });
    }
    if (!data?.result) {
      return res.status(500).json({ error: "Could not read the receipt." });
    }

    return res.status(200).json({ result: data.result, categories: data.categories || CATEGORIES });
  } catch (err) {
    if (err?.name === "AbortError") {
      return res.status(504).json({ error: "Reading the receipt took too long. Please try again." });
    }
    return res.status(500).json({ error: err.message || "Unknown server error" });
  } finally {
    clearTimeout(timer);
  }
}
