import { useState, useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useDrive } from "../lib/useDrive";
import { findMonthExpenseSheetId, listExpenseRows } from "../lib/google";
import { latestReceipts, categoryIcon, categoryTotals, formatCurrency } from "../lib/insights";
import DriveFallback from "../components/DriveFallback";

function prevMonthDate(d) {
  return new Date(d.getFullYear(), d.getMonth() - 1, 1);
}

function greetingForHour(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return "Good morning,";
  if (h < 18) return "Good afternoon,";
  return "Good evening,";
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
  const monthData = rows ? categoryTotals(rows, now) : null;

  return (
    <div className="container">
      <div className="app-header">
        <div>
          <div className="dash-greeting">{greetingForHour()}</div>
          <h1 className="dash-name">{firstName}</h1>
          <div className="dash-company">{profile.companyName}</div>
        </div>
      </div>

      {rows && rows.length === 0 ? (
        <div className="dash-empty">
          <h1 className="dash-empty-title">No receipts yet</h1>
          <p className="dash-empty-sub">Tap the camera button below to snap your first one.</p>
          <svg width="22" height="40" viewBox="0 0 22 40" className="dash-empty-arrow" aria-hidden="true">
            <path
              d="M11 0v30M11 30l-7-7M11 30l7-7"
              stroke="var(--muted)"
              strokeWidth="1.6"
              fill="none"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      ) : (
        <>
          {monthData && (
            <div className="dash-total">
              <span className="dash-total-label">Total expenses · {now.toLocaleString("en-US", { month: "long" })}</span>
              <span className="dash-total-amount">{formatCurrency(monthData.total, { decimals: 2 })}</span>
            </div>
          )}

          {error && <div className="status status-error">{error}</div>}

          <div className="section-header">
            <span className="section-title">Latest receipts</span>
            <Link href="/history" className="link">
              See all
            </Link>
          </div>

          {rows === null && !error && (
            <div className="status status-info">Loading receipts…</div>
          )}

          {rows && rows.length > 0 && (
            <div className="receipt-list">
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
        </>
      )}

      <div className="card feedback-card">
        <span className="feedback-card-title">Help us make BX better</span>
        <span className="feedback-card-sub">Tell us what's confusing, broken, or missing.</span>
        <a
          href="mailto:alireza.mthr@gmail.com?subject=BX%20feedback"
          className="btn btn-secondary feedback-card-btn"
        >
          Send feedback
        </a>
      </div>
    </div>
  );
}
