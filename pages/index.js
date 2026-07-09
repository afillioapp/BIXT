import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useDrive } from "../lib/useDrive";
import { findMonthExpenseSheetId, listExpenseRows } from "../lib/google";
import { latestReceipts, categoryIcon, weeklyTotals, categoryTotals } from "../lib/insights";
import DriveFallback from "../components/DriveFallback";
import InsightCards from "../components/InsightCards";

function prevMonthDate(d) {
  return new Date(d.getFullYear(), d.getMonth() - 1, 1);
}

function greetingForHour(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return "Good morning,";
  if (h < 18) return "Good afternoon,";
  return "Good evening,";
}

// "Jane Doe" -> "JD"; a single name -> first two letters; nothing -> "?".
function initialsFor(name, fallback) {
  const source = (name || fallback || "").trim();
  if (!source) return "?";
  const parts = source.split(/\s+/).filter(Boolean);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Home({ user }) {
  const router = useRouter();
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

  // Only send someone to onboarding when we positively know they have no BX
  // folder — i.e. Drive answered us. A connection problem (loadError) or a
  // missing token (needsConnect) must never re-onboard an existing customer.
  useEffect(() => {
    if (!profileLoading && !profile && accessToken && !loadError && !needsConnect) {
      router.replace("/setup");
    }
  }, [profileLoading, profile, accessToken, loadError, needsConnect]);

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

  const firstName = (user?.displayName || "").trim().split(/\s+/)[0] || profile.companyName;
  const latest = rows ? latestReceipts(rows, 4) : [];
  const now = new Date();
  const monthTag = now.toLocaleString("en-US", { month: "long", year: "numeric" });

  return (
    <div className="container">
      <div className="app-header">
        <div>
          <div className="dash-greeting">{greetingForHour()}</div>
          <h1>{firstName}</h1>
        </div>
        <div className="dash-avatar" aria-hidden="true">
          {initialsFor(user?.displayName, profile.companyName)}
        </div>
      </div>

      {error && <div className="status status-error">{error}</div>}

      {rows !== null && (
        <InsightCards
          weekly={weeklyTotals(rows, now)}
          categoryData={categoryTotals(rows, now)}
          monthTag={monthTag}
        />
      )}

      <div className="section-header">
        <span className="section-title">Latest receipts</span>
        <Link href="/history" className="link">
          See all
        </Link>
      </div>

      {rows === null && !error && (
        <div className="card">
          <div style={{ fontSize: 14 }}>Loading receipts…</div>
        </div>
      )}

      {rows && rows.length === 0 && (
        <div className="card empty-state">
          <div className="empty-state-icon">📸</div>
          <div className="empty-state-title">Snap your first receipt</div>
          <div className="empty-state-sub">Tap the camera button below to get started.</div>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="card receipt-list">
          {latest.map((r, i) => (
            <a
              key={i}
              className="receipt-row"
              href={r.receiptLink || undefined}
              target="_blank"
              rel="noreferrer"
            >
              <span className="receipt-icon" aria-hidden="true">
                {categoryIcon(r.category)}
              </span>
              <div className="receipt-row-main">
                <span className="receipt-place">{r.place || "Untitled"}</span>
                <span className="receipt-date">{r.date}</span>
              </div>
              <span className="receipt-amount">{r.total}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
