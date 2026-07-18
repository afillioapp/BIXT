import { useState, useEffect } from "react";
import { MoreHorizontal } from "lucide-react";
import { useDrive } from "../lib/useDrive";
import { findMonthExpenseSheetId, listExpenseRows } from "../lib/google";
import DriveFallback from "../components/DriveFallback";
import CategoryIcon from "../components/CategoryIcon";

// Extends the ported Lovable design language (routes/index.tsx's "Recent
// Expenses" white rows) to the full history view: navy rounded-bottom
// header (owner request — "the top part is dark on all pages") with the
// title + sub, date group headers, and the same expense-row component (now
// showing the category's icon instead of a tinted first-letter square, see
// components/CategoryIcon.js). Two-month read and all load/empty/error
// states unchanged.

function prevMonthDate(d) {
  return new Date(d.getFullYear(), d.getMonth() - 1, 1);
}

// Same stable per-category tint approach as pages/index.js (design's
// bg-*-50/text-*-600 pairs, hashed per category so a category always
// renders the same swatch).
const TINTS = [
  "bg-brand-teal-soft text-brand-teal",
  "bg-orange-50 text-orange-600",
  "bg-indigo-50 text-indigo-600",
  "bg-zinc-100 text-zinc-700",
  "bg-amber-50 text-amber-600",
  "bg-rose-50 text-rose-500",
  "bg-sky-50 text-sky-600",
  "bg-emerald-50 text-emerald-600",
];

function tintForCategory(category) {
  const key = category || "Other";
  let hash = 0;
  for (let i = 0; i < key.length; i++) hash = (hash * 31 + key.charCodeAt(i)) >>> 0;
  return TINTS[hash % TINTS.length];
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

        {rows && rows.length > 0 && (
          <div className="space-y-6">
            {groupByDate(rows).map((group) => (
              <section key={group.date}>
                <h2 className="text-sm font-semibold mb-3">{formatDateHeader(group.date)}</h2>
                <ul className="space-y-2.5">
                  {group.rows.map((r, i) => (
                    <li key={i}>
                      <a
                        className="flex items-center justify-between p-3 bg-white rounded-xl ring-1 ring-black/5"
                        href={r.receiptLink || undefined}
                        target="_blank"
                        rel="noreferrer"
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div className={`size-10 rounded-lg grid place-items-center shrink-0 ${tintForCategory(r.category)}`}>
                            <CategoryIcon category={r.category} className="size-4" />
                          </div>
                          <div className="min-w-0">
                            <p className="text-sm font-medium truncate">{r.place || "Untitled"}</p>
                            <p className="text-[11px] text-text-secondary truncate">{r.category || "Other"}</p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <p className="text-sm font-semibold text-text-primary">-{r.total}</p>
                          <MoreHorizontal className="size-4 text-zinc-400" />
                        </div>
                      </a>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
