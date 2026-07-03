import { useState, useEffect } from "react";
import { useDrive } from "../lib/useDrive";
import { findMonthExpenseSheetId, listExpenseRows } from "../lib/google";

function prevMonthDate(d) {
  return new Date(d.getFullYear(), d.getMonth() - 1, 1);
}

export default function History({ user }) {
  const { accessToken, rootFolderId, profile, profileLoading } = useDrive(user);
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
        <div className="card"><div style={{ fontSize: 14 }}>Loading…</div></div>
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
        <div className="card"><div style={{ fontSize: 14 }}>Loading receipts…</div></div>
      )}

      {rows && rows.length === 0 && (
        <div className="card"><div style={{ fontSize: 14 }}>No receipts saved yet.</div></div>
      )}

      {rows && rows.length > 0 && (
        <div className="card history-list">
          {rows.map((r, i) => (
            <a
              key={i}
              className="history-row"
              href={r.receiptLink || undefined}
              target="_blank"
              rel="noreferrer"
            >
              <div className="history-row-main">
                <span className="history-place">{r.place || "Untitled"}</span>
                <span className="history-date">{r.date}</span>
              </div>
              <span className="history-total">{r.total}</span>
            </a>
          ))}
        </div>
      )}
    </div>
  );
}
