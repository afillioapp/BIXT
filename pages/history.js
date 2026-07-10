import { useState, useEffect } from "react";
import { useRouter } from "next/router";
import { useDrive } from "../lib/useDrive";
import { findMonthExpenseSheetId, listExpenseRows } from "../lib/google";
import { categoryIcon } from "../lib/insights";
import DriveFallback from "../components/DriveFallback";

function prevMonthDate(d) {
  return new Date(d.getFullYear(), d.getMonth() - 1, 1);
}

// Line-icon gear — the header's entry point to Settings now that it's no
// longer a bottom-nav tab (see components/BottomNav.js).
function GearIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
    </svg>
  );
}

// Rows arrive already sorted most-recent-first; bucket consecutive rows that
// share a date under one header instead of repeating it as a section per row.
function groupByDate(rows) {
  const groups = [];
  const byDate = new Map();
  for (const r of rows) {
    const key = r.date || "Unknown date";
    let group = byDate.get(key);
    if (!group) {
      group = { date: key, rows: [] };
      byDate.set(key, group);
      groups.push(group);
    }
    group.rows.push(r);
  }
  return groups;
}

function formatDateHeader(dateStr) {
  if (!dateStr) return "Unknown date";
  const d = new Date(`${dateStr}T00:00:00`);
  if (isNaN(d.getTime())) return dateStr;
  // Today's group is labeled "Today" instead of its date, per the handoff.
  if (d.toDateString() === new Date().toDateString()) return "Today";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
}

export default function History({ user }) {
  const router = useRouter();
  const { accessToken, rootFolderId, profile, profileLoading, needsConnect, loadError, requestAccess, retryConnection } = useDrive(user);
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
        const combined = results.flat().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
        setRows(combined);
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
    }
    load();
    return () => { cancelled = true; };
  }, [accessToken, rootFolderId]);

  if (profileLoading || !profile) {
    return (
      <div className="container">
        <div className="app-header">
          <div><h1>History</h1></div>
          <button className="header-gear" aria-label="Settings" onClick={() => router.push("/settings")}>
            <GearIcon />
          </button>
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
          <h1>History</h1>
          <div className="subtitle">Last two months</div>
        </div>
        <button className="header-gear" aria-label="Settings" onClick={() => router.push("/settings")}>
          <GearIcon />
        </button>
      </div>

      {error && <div className="status status-error">{error}</div>}

      {rows === null && !error && (
        <div className="status status-info">Loading receipts…</div>
      )}

      {rows && rows.length === 0 && (
        <div className="history-empty">
          <div className="history-empty-title">Nothing here yet</div>
          <div className="history-empty-sub">Receipts you save will show up here, grouped by day.</div>
        </div>
      )}

      {rows && rows.length > 0 && (
        <div className="history-groups">
          {groupByDate(rows).map((group) => (
            <div key={group.date} className="history-group">
              <div className="history-group-header">{formatDateHeader(group.date)}</div>
              <div className="receipt-list">
                {group.rows.map((r, i) => (
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
                      <span className="receipt-date">{r.category || "Other"}</span>
                    </div>
                    <span className="receipt-amount">{r.total}</span>
                  </a>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
