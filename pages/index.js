import { useEffect } from "react";
import { useRouter } from "next/router";
import { useDrive } from "../lib/useDrive";
import DriveFallback from "../components/DriveFallback";

// Placeholder Home shell for this step of the redesign — the full dashboard
// (greeting header, insight cards, latest receipts) lands in the next commit.
// This still owns the guarded no-profile->/setup redirect, since OAuth
// redirects land back on "/".
export default function Home({ user }) {
  const router = useRouter();
  const {
    accessToken,
    profile,
    profileLoading,
    needsConnect,
    loadError,
    requestAccess,
    retryConnection,
  } = useDrive(user);

  useEffect(() => {
    if (!profileLoading && !profile && accessToken && !loadError && !needsConnect) {
      router.replace("/setup");
    }
  }, [profileLoading, profile, accessToken, loadError, needsConnect]);

  if (profileLoading || !profile) {
    return (
      <div className="container">
        <div className="app-header">
          <div>
            <h1>BX</h1>
          </div>
        </div>
        <DriveFallback
          needsConnect={needsConnect}
          loadError={loadError}
          onConnect={requestAccess}
          onRetry={retryConnection}
        />
      </div>
    );
  }

  return (
    <div className="container">
      <div className="app-header">
        <div>
          <h1>Hi, {(user?.displayName || "").trim().split(/\s+/)[0] || profile.companyName}</h1>
          <div className="subtitle">{profile.companyName}</div>
        </div>
      </div>
      <div className="card">
        <div style={{ fontSize: 14 }}>Tap the camera button below to snap a receipt.</div>
      </div>
    </div>
  );
}
