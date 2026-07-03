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

// Shared Drive session for every authenticated page: silently re-requests an
// access token for users who've already granted Drive access (so returning
// users skip straight to the app), and loads the profile that lives on the
// user's "BIXT - {Company}" root folder, if one exists yet.
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

  const tokenClientRef = useRef(null);
  const gotTokenRef = useRef(false);

  const loadRootAndProfile = useCallback(async (token) => {
    try {
      const rootId = await findExistingCompanyRootFolder(token);
      setRootFolderId(rootId);
      setProfile(rootId ? await getProfile(token, rootId) : null);
    } finally {
      setProfileLoading(false);
    }
  }, []);

  const handleToken = useCallback(
    (resp) => {
      if (resp.access_token) {
        gotTokenRef.current = true;
        setAccessToken(resp.access_token);
        setNeedsConnect(false);
        loadRootAndProfile(resp.access_token);
      }
    },
    [loadRootAndProfile]
  );

  useEffect(() => {
    if (!user) return;
    let cancelled = false;
    setProfileLoading(true);
    gotTokenRef.current = false;

    loadGsiScript().then(() => {
      if (cancelled) return;
      const client = window.google.accounts.oauth2.initTokenClient({
        client_id: process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID,
        scope: SCOPES,
        callback: handleToken,
      });
      tokenClientRef.current = client;
      client.requestAccessToken({ prompt: "" });

      setTimeout(() => {
        if (!cancelled && !gotTokenRef.current) {
          setNeedsConnect(true);
          setProfileLoading(false);
        }
      }, 2500);
    });

    return () => {
      cancelled = true;
    };
  }, [user, handleToken]);

  const requestAccess = useCallback(() => {
    if (!tokenClientRef.current) return;
    setProfileLoading(true);
    setNeedsConnect(false);
    tokenClientRef.current.requestAccessToken({ prompt: "consent" });
  }, []);

  const reloadProfile = useCallback(() => {
    if (accessToken) loadRootAndProfile(accessToken);
  }, [accessToken, loadRootAndProfile]);

  return {
    accessToken,
    rootFolderId,
    profile,
    profileLoading,
    needsConnect,
    requestAccess,
    reloadProfile,
  };
}
