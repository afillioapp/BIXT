import { useState, useEffect } from "react";
import { useDrive } from "../lib/useDrive";
import { findMonthExpenseSheetId, listExpenseRows } from "../lib/google";
import { categoryIcon, categoryColor, categoryTextColor } from "../lib/insights";
import DriveFallback from "../components/DriveFallback";

function prevMonthDate(d) {
  return new Date(d.getFullYear(), d.getMonth() - 1, 1);
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
        <div className="app-header"><div><h1>History</h1></div></div>
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
                    <span
                      className="receipt-icon"
                      aria-hidden="true"
                      style={{ background: categoryColor(r.category), color: categoryTextColor(r.category) }}
                    >
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
