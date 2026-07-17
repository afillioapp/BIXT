import { useState, useEffect } from "react";
import { useDrive } from "../lib/useDrive";
import { findMonthExpenseSheetId, listExpenseRows } from "../lib/google";
import { weeklyTotals, categoryTotals } from "../lib/insights";
import DriveFallback from "../components/DriveFallback";
import InsightCards from "../components/InsightCards";

// Charts moved here from Home (owner decision) — same current+previous
// month row-loading pattern as pages/index.js, minus the setup redirect:
// Stats is a secondary tab, not the app's entry route, so it has no
// business sending a signed-in-but-not-yet-onboarded user to /setup —
// that's still Home's job.
function prevMonthDate(d) {
  return new Date(d.getFullYear(), d.getMonth() - 1, 1);
}

export default function Stats({ user }) {
  const {
    accessToken,
    rootFolderId,
    profile,
    profileLoading,
    needsConnect,
    loadError,
    requestAccess,
    retryConnection,
  } = useDrive(user);

  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!accessToken || !rootFolderId) return;
    let cancelled = false;

    async function load() {
      setError("");
      try {
        const now = new Date();
        const months = [now, prevMonthDate(now)];
        const results = await Promise.all(
          months.map(async (d) => {
            const sheetId = await findMonthExpenseSheetId(accessToken, rootFolderId, d);
            return sheetId ? listExpenseRows(accessToken, sheetId) : [];
          })
        );
        if (cancelled) return;
        setRows(results.flat());
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }
    load();
    return () => {
      cancelled = true;
    };
  }, [accessToken, rootFolderId]);

  if (profileLoading || !profile) {
    return (
      <div className="container">
        <div className="app-header">
          <div>
            <h1>Stats</h1>
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

  const now = new Date();
  const monthTag = now.toLocaleString("en-US", { month: "long" });
  const monthData = rows ? categoryTotals(rows, now) : null;

  return (
    <div className="container">
      <div className="app-header">
        <div>
          <h1>Stats</h1>
          <div className="subtitle">{monthTag}</div>
        </div>
      </div>

      {error && <div className="status status-error">{error}</div>}

      {rows === null && !error && (
        <div className="status status-info">Loading receipts…</div>
      )}

      {rows !== null && (
        <InsightCards
          weekly={weeklyTotals(rows, now)}
          categoryData={monthData}
          monthTag={monthTag}
        />
      )}
    </div>
  );
}
