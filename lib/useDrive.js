import { useState, useEffect, useRef, useCallback } from "react";
import { findExistingCompanyRootFolder, getProfile } from "./google";

const SCOPES =
  "https://www.googleapis.com/auth/drive.file https://www.googleapis.com/auth/spreadsheets";
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

  const tokenClientRef = useRef(null);
  const gotTokenRef = useRef(false);
  const refreshTimerRef = useRef(null);
  const pendingRefreshRef = useRef(null); // { resolve, reject, timer } for refreshAccessToken()

  const loadRootAndProfile = useCallback(async (token) => {
    try {
      const rootId = await findExistingCompanyRootFolder(token);
      setRootFolderId(rootId);
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

  // Loads the GIS script if needed, builds the token client, and requests a
  // token with the given prompt mode. Any failure (script blocked, popup
  // dismissed, network hiccup, etc.) falls back to needsConnect so the UI
  // never hangs on "Loading…" forever.
  const initAndRequest = useCallback(
    (prompt) => {
      loadGsiScript()
        .then(() => {
          const client = window.google.accounts.oauth2.initTokenClient({
            client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
            scope: SCOPES,
            callback: handleToken,
            // Fires when the consent popup is dismissed or fails to open —
            // without this, dismissing the popup left the app on "Loading…"
            // with no way forward.
            error_callback: handleTokenFailure,
          });
          tokenClientRef.current = client;
          client.requestAccessToken({ prompt });
        })
        .catch(() => {
          setNeedsConnect(true);
          setProfileLoading(false);
        });
    },
    [handleToken, handleTokenFailure]
  );

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setProfileLoading(true);
    setNeedsConnect(false);
    setLoadError(false);
    gotTokenRef.current = false;

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
  }, [user, initAndRequest]);

  const requestAccess = useCallback(() => {
    setProfileLoading(true);
    setNeedsConnect(false);
    setLoadError(false);
    if (tokenClientRef.current) {
      tokenClientRef.current.requestAccessToken({ prompt: "consent" });
    } else {
      initAndRequest("consent");
    }
  }, [initAndRequest]);

  // On-demand silent token renewal, for retrying a Drive call that failed
  // with an expired token. Resolves with a fresh token or rejects.
  const refreshAccessToken = useCallback(() => {
    return new Promise((resolve, reject) => {
      if (!tokenClientRef.current) {
        return reject(new Error("Google Drive is not connected."));
      }
      settlePendingRefresh(null); // at most one waiter
      const timer = setTimeout(() => {
        if (pendingRefreshRef.current) {
          pendingRefreshRef.current = null;
          reject(new Error("Google Drive connection expired. Please reconnect."));
        }
      }, EXPLICIT_REFRESH_TIMEOUT_MS);
      pendingRefreshRef.current = { resolve, reject, timer };
      tokenClientRef.current.requestAccessToken({ prompt: "" });
    });
  }, [settlePendingRefresh]);

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

  return {
    accessToken,
    rootFolderId,
    profile,
    profileLoading,
    needsConnect,
    loadError,
    requestAccess,
    refreshAccessToken,
    retryConnection,
    reloadProfile,
  };
}
