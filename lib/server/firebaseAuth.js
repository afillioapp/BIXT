import { createRemoteJWKSet, jwtVerify } from "jose";

// Firebase signs ID tokens with Google-hosted keys; verifying against them
// needs no service-account secret on our side.
const FIREBASE_JWKS = createRemoteJWKSet(
  new URL("https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com")
);

// The signed-in BX user behind a request's "Authorization: Bearer <ID token>",
// as { uid, email, phone }, or null if the token is missing or bad.
export async function verifyCaller(req) {
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
    if (!payload.sub) return null;
    return {
      uid: payload.sub,
      email: payload.email_verified ? String(payload.email || "").toLowerCase() : "",
      phone: payload.phone_number || "",
    };
  } catch {
    return null;
  }
}
