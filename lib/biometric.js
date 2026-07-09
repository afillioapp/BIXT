// Local device-lock using the browser's built-in Face ID / fingerprint
// prompt (the WebAuthn platform authenticator). This is NOT a server-verified
// auth step — it's a convenience lock that stops casual access if someone
// picks up or borrows this device while it's already signed in. A technical
// attacker with devtools access to this browser profile can clear the
// localStorage flag below and get back in; that's an accepted trade-off
// (product decision), not an oversight.

function storageKey(uid) {
  return `bx_biolock_${uid}`;
}

function unlockedKey(uid) {
  return `bx_unlocked_${uid}`;
}

// Uint8Array <-> base64url helpers, no padding. Used to persist the
// credential's rawId (can't store a raw ArrayBuffer in localStorage) and to
// rebuild it for verifyLock's allowCredentials list.
function bufferToBase64url(buffer) {
  const bytes = new Uint8Array(buffer);
  let str = "";
  for (let i = 0; i < bytes.length; i++) str += String.fromCharCode(bytes[i]);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function base64urlToBuffer(base64url) {
  const base64 = base64url.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const str = atob(padded);
  const bytes = new Uint8Array(str.length);
  for (let i = 0; i < str.length; i++) bytes[i] = str.charCodeAt(i);
  return bytes;
}

export async function biometricAvailable() {
  try {
    if (typeof window === "undefined") return false;
    if (!window.PublicKeyCredential?.isUserVerifyingPlatformAuthenticatorAvailable) return false;
    return await window.PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

export function isLockEnabled(uid) {
  if (typeof window === "undefined" || !uid) return false;
  return !!window.localStorage.getItem(storageKey(uid));
}

export async function enableLock(user) {
  const credential = await navigator.credentials.create({
    publicKey: {
      challenge: crypto.getRandomValues(new Uint8Array(32)),
      rp: { name: "BX" },
      user: {
        id: new TextEncoder().encode(user.uid),
        name: user.email || user.phoneNumber || "BX user",
        displayName: user.displayName || "BX user",
      },
      pubKeyCredParams: [
        { type: "public-key", alg: -7 },
        { type: "public-key", alg: -257 },
      ],
      authenticatorSelection: {
        authenticatorAttachment: "platform",
        userVerification: "required",
        residentKey: "preferred",
      },
      timeout: 60000,
    },
  });

  window.localStorage.setItem(storageKey(user.uid), bufferToBase64url(credential.rawId));
}

export function disableLock(uid) {
  window.localStorage.removeItem(storageKey(uid));
  window.sessionStorage.removeItem(unlockedKey(uid));
}

export async function verifyLock(uid) {
  try {
    const stored = window.localStorage.getItem(storageKey(uid));
    if (!stored) return false;

    const credentialId = base64urlToBuffer(stored);
    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: crypto.getRandomValues(new Uint8Array(32)),
        allowCredentials: [
          { type: "public-key", id: credentialId, transports: ["internal"] },
        ],
        userVerification: "required",
        timeout: 60000,
      },
    });

    return !!assertion;
  } catch {
    return false;
  }
}
