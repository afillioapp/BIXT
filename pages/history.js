import { useState, useEffect, useCallback } from "react";
import { useDrive } from "../lib/useDrive";
import { findMonthExpenseSheetId, listExpenseRows, deleteExpenseRow } from "../lib/google";
import DriveFallback from "../components/DriveFallback";
import ExpenseRow, { rowIdFor } from "../components/ExpenseRow";
import EditExpenseSheet from "../components/EditExpenseSheet";

// Extends the ported Lovable design language (routes/index.tsx's "Recent
// Expenses" white rows) to the full history view: navy rounded-bottom
// header (owner request — "the top part is dark on all pages") with the
// title + sub, date group headers, and the shared swipeable expense-row
// component (components/ExpenseRow.js) with Receipt/Edit/Delete actions.
// Two-month read and all load/empty/error states unchanged.

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

  // Swipe-to-act row state (same pattern as pages/index.js): which row is
  // swiped open, which row's edit sheet is up, and delete errors.
  const [openRowId, setOpenRowId] = useState(null);
  const [editingRow, setEditingRow] = useState(null);
  const [actionError, setActionError] = useState("");

  // Pulled out of the load effect so a mutation (edit/delete) can re-run the
  // same two-month fetch on demand — rows are never spliced locally, since a
  // delete/edit shifts every later row's sheet index in that same month
  // sheet; only a fresh read from Drive is safe.
  const load = useCallback(async () => {
    if (!accessToken || !rootFolderId) return;
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
      const combined = results.flat().sort((a, b) => (b.date || "").localeCompare(a.date || ""));
      setRows(combined);
    } catch (err) {
      setError(err.message);
    }
  }, [accessToken, rootFolderId]);

  useEffect(() => {
    load();
  }, [load]);

  async function handleDeleteRow(row) {
    setActionError("");
    try {
      await deleteExpenseRow(accessToken, row.sheetId, row.rowIndex);
      await load();
    } catch (err) {
      setActionError(err.message || "Couldn't delete — try again");
      throw err;
    }
  }

  async function handleSavedRow() {
    setEditingRow(null);
    await load();
  }

  if (profileLoading || !profile) {
    return (
      <div className="min-h-screen bg-background font-sans text-text-primary pb-28">
        <div className="bg-brand-navy rounded-b-3xl pt-10 pb-7 text-white relative z-10 shadow-xl shadow-brand-navy/25">
          <div className="mx-auto max-w-md px-5">
            <h1 className="text-2xl font-semibold tracking-tight">History</h1>
          </div>
        </div>
        <div className="mx-auto max-w-md px-5 pt-6">
          <DriveFallback
            needsConnect={needsConnect}
            loadError={loadError}
            onConnect={requestAccess}
            onRetry={retryConnection}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background font-sans text-text-primary pb-28">
      <div className="bg-brand-navy rounded-b-3xl pt-10 pb-7 text-white relative z-10 shadow-xl shadow-brand-navy/25">
        <div className="mx-auto max-w-md px-5">
          <h1 className="text-2xl font-semibold tracking-tight">History</h1>
          <p className="text-xs text-white/60 mt-1">Last two months</p>
        </div>
      </div>

      <div className="mx-auto max-w-md px-5 pt-6">
        {error && <div className="text-xs text-destructive mb-4">{error}</div>}

        {rows === null && !error && (
          <p className="text-xs text-text-secondary">Loading receipts…</p>
        )}

        {rows && rows.length === 0 && (
          <div className="flex flex-col items-center text-center gap-2 py-20">
            <p className="text-sm font-semibold">Nothing here yet</p>
            <p className="text-xs text-text-secondary max-w-[230px]">
              Receipts you save will show up here, grouped by day.
            </p>
          </div>
        )}

        {actionError && <p className="text-xs text-destructive mb-4">{actionError}</p>}

        {rows && rows.length > 0 && (
          <div className="space-y-6">
            {groupByDate(rows).map((group) => (
              <section key={group.date}>
                <h2 className="text-sm font-semibold mb-3">{formatDateHeader(group.date)}</h2>
                <ul className="space-y-2.5">
                  {group.rows.map((r) => (
                    <ExpenseRow
                      key={rowIdFor(r)}
                      row={r}
                      openId={openRowId}
                      onOpenChange={setOpenRowId}
                      onEdit={setEditingRow}
                      onDelete={handleDeleteRow}
                    />
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>

      <EditExpenseSheet
        accessToken={accessToken}
        row={editingRow}
        onClose={() => setEditingRow(null)}
        onSaved={handleSavedRow}
      />
    </div>
  );
}
