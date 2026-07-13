import { useState, useEffect, useRef, useCallback } from "react";
import { findExistingCompanyRootFolder, getProfile, getDriveAccountEmail } from "./google";

// drive.file only ("files this app creates") — deliberately NOT the broad
// spreadsheets scope. The Sheets API accepts drive.file authorization for
// spreadsheets the app itself created, which is the only kind BX touches,
// and staying off Google's "sensitive" scope list is what keeps the
// unverified-app warning off the consent screen (no review needed).
const SCOPES = "https://www.googleapis.com/auth/drive.file";
const GSI_SRC = "https://accounts.google.com/gsi/client";

function loadGsiScript() {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.oauth2) return resolve();
    const existing = document.querySelector(`script[src="${GSI_SRC}"]`);
    if (existing) {
      existing.addEventListener("load", () => resolve());
      existing.addEventListener("error", reject);
      return;
    }
    const script = document.createElement("script");
    script.src = GSI_SRC;
    script.async = true;
    script.defer = true;
    script.onload = () => resolve();
    script.onerror = reject;
    document.head.appendChild(script);
  });
}

// Refresh the access token this long before Google expires it (~1h), so a
// user who leaves the tab open never hits a dead token mid-save.
const REFRESH_MARGIN_MS = 5 * 60 * 1000;
const EXPLICIT_REFRESH_TIMEOUT_MS = 10 * 1000;

// The token must survive page reloads: iOS Safari/Chrome reload the app tab
// after the consent popup closes, and GIS's silent reissue doesn't work there
// — without persistence the user is stuck in an endless "Connect" loop.
// Tradeoff: the token sits in localStorage for its ≤1h lifetime, scoped to
// drive.file + spreadsheets only, and is cleared on disconnect/sign-out.
const TOKEN_STORAGE_KEY = "bx_drive_token";

function readStoredToken() {
  try {
    const raw = localStorage.getItem(TOKEN_STORAGE_KEY);
    if (!raw) return null;
    const { token, expiresAt } = JSON.parse(raw);
    // Ignore tokens within 2 minutes of expiry — not worth resuming.
    if (!token || !expiresAt || Date.now() > expiresAt - 2 * 60 * 1000) return null;
    return { token, expiresAt };
  } catch {
    return null;
  }
}

function storeToken(token, expiresInSeconds) {
  try {
    const seconds = Number(expiresInSeconds) || 3600;
    localStorage.setItem(
      TOKEN_STORAGE_KEY,
      JSON.stringify({ token, expiresAt: Date.now() + seconds * 1000 })
    );
  } catch {}
}

function clearStoredToken() {
  try {
    localStorage.removeItem(TOKEN_STORAGE_KEY);
  } catch {}
}

// The explicit "Connect Google Drive" button uses a full-page redirect, not
// GIS's popup: on iOS the popup routinely fails to deliver the token back to
// the app (blank page, suspended opener tab). A whole-page round trip to
// Google has nothing to break. Requires https://bixt.vercel.app (the app
// origin) to be an Authorized redirect URI on the OAuth client.
const REDIRECT_STATE_KEY = "bx_drive_oauth_state";
// Remembers that this browser has granted Drive access before, so future
// visits can bounce through Google silently instead of showing "Connect".
const GRANTED_KEY = "bx_drive_granted";
// Per-tab guard so a failing silent reconnect can't redirect-loop.
const AUTO_RECONNECT_KEY = "bx_drive_auto_reconnect";

function beginRedirectConnect({ silent = false } = {}) {
  const state = Math.random().toString(36).slice(2) + Date.now().toString(36);
  try {
    localStorage.setItem(REDIRECT_STATE_KEY, state);
  } catch {}
  const params = new URLSearchParams({
    client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
    redirect_uri: window.location.origin,
    response_type: "token",
    scope: SCOPES,
    state,
    include_granted_scopes: "true",
  });
  // prompt=none: come straight back with a token or an error, never show UI.
  if (silent) params.set("prompt", "none");
  window.location.assign(`https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`);
}

// Picks up the token (or error) Google appended to the URL when returning
// from the redirect flow. Strips it from the address bar immediately.
function consumeRedirectToken() {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash;
  if (!hash || (!hash.includes("access_token=") && !hash.includes("error="))) return null;
  const params = new URLSearchParams(hash.slice(1));
  const token = params.get("access_token");
  const error = params.get("error");
  const expiresIn = params.get("expires_in");
  const state = params.get("state");
  let expectedState = null;
  try {
    expectedState = localStorage.getItem(REDIRECT_STATE_KEY);
    localStorage.removeItem(REDIRECT_STATE_KEY);
  } catch {}
  window.history.replaceState(null, "", window.location.pathname + window.location.search);
  if (error) return { error };
  if (!token || (expectedState && state !== expectedState)) return null;
  return { token, expiresIn: Number(expiresIn) || 3600 };
}

// Shared Drive session for every authenticated page: silently re-requests an
// access token for users who've already granted Drive access (so returning
// users skip straight to the app), and loads the profile that lives on the
// user's "BX - {Company}" root folder, if one exists yet.
//
// Distinguishes three "no profile" situations that must not be conflated:
//   needsConnect — we have no usable token (user must tap Connect)
//   loadError    — we have a token but Drive couldn't be reached (Retry;
//                  treating this as "new user" used to re-onboard existing
//                  customers and could fork their books into a second folder)
//   profile null with neither flag — genuinely not set up yet (go to /setup)
//
// Note: GIS's silent reissue isn't 100% guaranteed on every browser (notably
// iOS Safari's third-party-storage restrictions can force an interactive
// prompt even for a previously-granted user) — `needsConnect` covers that
// fallback case.
export function useDrive(user) {
  const [accessToken, setAccessToken] = useState(null);
  const [rootFolderId, setRootFolderId] = useState(null);
  const [profile, setProfile] = useState(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [needsConnect, setNeedsConnect] = useState(false);
  const [loadError, setLoadError] = useState(false);
  const [driveEmail, setDriveEmail] = useState(null);

  const tokenClientRef = useRef(null);
  const gotTokenRef = useRef(false);
  const refreshTimerRef = useRef(null);
  const pendingRefreshRef = useRef(null); // { resolve, reject, timer } for refreshAccessToken()

  const loadRootAndProfile = useCallback(async (token) => {
    try {
      const [rootId, email] = await Promise.all([
        findExistingCompanyRootFolder(token),
        getDriveAccountEmail(token),
      ]);
      setRootFolderId(rootId);
      setDriveEmail(email);
      setProfile(rootId ? await getProfile(token, rootId) : null);
      setLoadError(false);
    } catch {
      // Drive unreachable ≠ "no profile" — surface a retry, never /setup.
      setLoadError(true);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const settlePendingRefresh = useCallback((token) => {
    const pending = pendingRefreshRef.current;
    if (!pending) return;
    pendingRefreshRef.current = null;
    clearTimeout(pending.timer);
    if (token) pending.resolve(token);
    else pending.reject(new Error("Google Drive connection expired. Please reconnect."));
  }, []);

  const scheduleSilentRefresh = useCallback((expiresInSeconds) => {
    clearTimeout(refreshTimerRef.current);
    const seconds = Number(expiresInSeconds);
    if (!seconds || Number.isNaN(seconds)) return;
    const delay = Math.max(seconds * 1000 - REFRESH_MARGIN_MS, 60 * 1000);
    refreshTimerRef.current = setTimeout(() => {
      tokenClientRef.current?.requestAccessToken({ prompt: "" });
    }, delay);
  }, []);

  const handleTokenFailure = useCallback(() => {
    settlePendingRefresh(null);
    setNeedsConnect(true);
    setProfileLoading(false);
  }, [settlePendingRefresh]);

  const handleToken = useCallback(
    (resp) => {
      if (resp.access_token) {
        gotTokenRef.current = true;
        setAccessToken(resp.access_token);
        setNeedsConnect(false);
        storeToken(resp.access_token, resp.expires_in);
        try {
          localStorage.setItem(GRANTED_KEY, "1");
          sessionStorage.removeItem(AUTO_RECONNECT_KEY);
        } catch {}
        scheduleSilentRefresh(resp.expires_in);
        settlePendingRefresh(resp.access_token);
        loadRootAndProfile(resp.access_token);
      } else {
        // Covers GIS error responses (e.g. consent denied) delivered via the
        // normal callback rather than error_callback.
        handleTokenFailure();
      }
    },
    [loadRootAndProfile, scheduleSilentRefresh, settlePendingRefresh, handleTokenFailure]
  );

  // Loads the GIS script if needed and builds the token client once, without
  // requesting a token — also used when resuming from a stored token, so
  // later renewals have a client ready.
  const ensureClient = useCallback(async () => {
    await loadGsiScript();
    if (!tokenClientRef.current) {
      tokenClientRef.current = window.google.accounts.oauth2.initTokenClient({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
        scope: SCOPES,
        callback: handleToken,
        // Fires when the consent popup is dismissed or fails to open —
        // without this, dismissing the popup left the app on "Loading…"
        // with no way forward.
        error_callback: handleTokenFailure,
      });
    }
    return tokenClientRef.current;
  }, [handleToken, handleTokenFailure]);

  // Requests a token with the given prompt mode. Any failure (script
  // blocked, popup dismissed, network hiccup, etc.) falls back to
  // needsConnect so the UI never hangs on "Loading…" forever.
  const initAndRequest = useCallback(
    (prompt) => {
      ensureClient()
        .then((client) => client.requestAccessToken({ prompt }))
        .catch(() => {
          setNeedsConnect(true);
          setProfileLoading(false);
        });
    },
    [ensureClient]
  );

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setProfileLoading(true);
    setNeedsConnect(false);
    setLoadError(false);
    gotTokenRef.current = false;

    const cleanup = () => {
      cancelled = true;
      clearTimeout(refreshTimerRef.current);
    };
    const adopt = (token, expiresInSeconds) => {
      gotTokenRef.current = true;
      setAccessToken(token);
      scheduleSilentRefresh(expiresInSeconds);
      loadRootAndProfile(token);
      ensureClient().catch(() => {}); // ready for later renewals
    };

    // Returning from the full-page Google redirect? The token is in the URL.
    const redirected = consumeRedirectToken();
    if (redirected?.token) {
      storeToken(redirected.token, redirected.expiresIn);
      try {
        localStorage.setItem(GRANTED_KEY, "1");
        sessionStorage.removeItem(AUTO_RECONNECT_KEY);
      } catch {}
      adopt(redirected.token, redirected.expiresIn);
      return cleanup;
    }
    if (redirected?.error) {
      // Silent reconnect was refused (signed out of Google, access revoked…)
      // — fall back to the explicit Connect button, never loop.
      setNeedsConnect(true);
      setProfileLoading(false);
      return cleanup;
    }

    // Resume the session saved before a reload (iOS reloads the app tab
    // after the consent popup closes, and silent reissue doesn't work there
    // — without this the user loops on "Connect Google Drive" forever).
    const stored = readStoredToken();
    if (stored) {
      adopt(stored.token, (stored.expiresAt - Date.now()) / 1000);
      return cleanup;
    }

    // This browser has connected before but the saved token expired: bounce
    // through Google silently (prompt=none) so returning users never have to
    // tap Connect again. The per-tab marker prevents redirect loops.
    let grantedBefore = false;
    let alreadyAttempted = false;
    try {
      grantedBefore = localStorage.getItem(GRANTED_KEY) === "1";
      alreadyAttempted = sessionStorage.getItem(AUTO_RECONNECT_KEY) === "1";
    } catch {}
    if (grantedBefore && !alreadyAttempted) {
      try {
        sessionStorage.setItem(AUTO_RECONNECT_KEY, "1");
      } catch {}
      beginRedirectConnect({ silent: true });
      return cleanup; // navigating away
    }

    initAndRequest("");

    // Covers every hang scenario (script never loads, token request never
    // calls back) with one timer, independent of where things got stuck.
    const giveUp = setTimeout(() => {
      if (!cancelled && !gotTokenRef.current) {
        setNeedsConnect(true);
        setProfileLoading(false);
      }
    }, 6000);

    return () => {
      cancelled = true;
      clearTimeout(giveUp);
      clearTimeout(refreshTimerRef.current);
    };
  }, [user, initAndRequest, ensureClient, scheduleSilentRefresh, loadRootAndProfile]);

  // Explicit user-initiated connect: leave the page for Google and come
  // back with the token in the URL. No popup, so nothing iOS can break.
  const requestAccess = useCallback(() => {
    setProfileLoading(true);
    setNeedsConnect(false);
    setLoadError(false);
    beginRedirectConnect();
  }, []);

  // On-demand silent token renewal, for retrying a Drive call that failed
  // with an expired token. Resolves with a fresh token or rejects.
  const refreshAccessToken = useCallback(() => {
    return new Promise((resolve, reject) => {
      settlePendingRefresh(null); // at most one waiter
      const timer = setTimeout(() => {
        if (pendingRefreshRef.current) {
          pendingRefreshRef.current = null;
          reject(new Error("Google Drive connection expired. Please reconnect."));
        }
      }, EXPLICIT_REFRESH_TIMEOUT_MS);
      pendingRefreshRef.current = { resolve, reject, timer };
      ensureClient()
        .then((client) => client.requestAccessToken({ prompt: "" }))
        .catch(() => settlePendingRefresh(null));
    });
  }, [settlePendingRefresh, ensureClient]);

  // Retry after a loadError (e.g. flaky connection while fetching profile).
  const retryConnection = useCallback(() => {
    setLoadError(false);
    setProfileLoading(true);
    if (accessToken) {
      loadRootAndProfile(accessToken);
    } else {
      initAndRequest("");
    }
  }, [accessToken, loadRootAndProfile, initAndRequest]);

  const reloadProfile = useCallback(() => {
    if (accessToken) loadRootAndProfile(accessToken);
  }, [accessToken, loadRootAndProfile]);

  // Fully let go of the Drive grant — used on sign-out so the next person on
  // this device can't silently inherit this user's Drive connection.
  const disconnect = useCallback(() => {
    return new Promise((resolve) => {
      clearTimeout(refreshTimerRef.current);
      settlePendingRefresh(null);
      const finish = () => {
        clearStoredToken();
        try {
          localStorage.removeItem(GRANTED_KEY);
          sessionStorage.removeItem(AUTO_RECONNECT_KEY);
        } catch {}
        setAccessToken(null);
        setRootFolderId(null);
        setProfile(null);
        setDriveEmail(null);
        tokenClientRef.current = null;
        resolve();
      };
      const revoke = window.google?.accounts?.oauth2?.revoke;
      if (accessToken && revoke) {
        try {
          revoke(accessToken, finish);
          // Don't let a hung revoke callback block sign-out.
          setTimeout(finish, 2000);
        } catch {
          finish();
        }
      } else {
        finish();
      }
    });
  }, [accessToken, settlePendingRefresh]);

  return {
    accessToken,
    rootFolderId,
    profile,
    profileLoading,
    needsConnect,
    loadError,
    driveEmail,
    requestAccess,
    refreshAccessToken,
    retryConnection,
    reloadProfile,
    disconnect,
  };
}
