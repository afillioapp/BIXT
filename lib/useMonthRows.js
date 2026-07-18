import { useCallback, useEffect, useRef, useState } from "react";
import { findMonthExpenseSheetId, listExpenseRows } from "./google";

function monthKey(d) {
  return `${d.getFullYear()}-${d.getMonth()}`;
}

function prevMonthDate(d) {
  return new Date(d.getFullYear(), d.getMonth() - 1, 1);
}

// Shared per-month expense-row cache + on-demand fetcher. Both pages/index.js
// (home's carousel) and pages/stats.js (Week/Month period navigation) need
// "give me this month's rows, fetching from Drive only if we don't have them
// yet" — this hook is the one place that logic lives, so sliding through
// weeks/months never re-fetches a month either page already pulled.
//
// Seeds the current + previous month automatically as soon as
// accessToken/rootFolderId are available (mirrors every page's original
// two-month initial load). Callers ask for any additional months (e.g. a
// week that spans a month boundary, or an arrow navigated further back) via
// ensureMonths.
export function useMonthRows(accessToken, rootFolderId) {
  const cacheRef = useRef(new Map());
  const inFlightRef = useRef(new Set());
  // Bumping this forces callers of the hook to re-render once a background
  // fetch lands and mutates cacheRef (a plain ref mutation alone wouldn't).
  const [, setVersion] = useState(0);
  const [loading, setLoading] = useState(false);

  const ensureMonths = useCallback(
    (dates) => {
      if (!accessToken || !rootFolderId) return;
      const missing = [];
      const seen = new Set();
      for (const d of dates || []) {
        const key = monthKey(d);
        if (seen.has(key) || cacheRef.current.has(key) || inFlightRef.current.has(key)) continue;
        seen.add(key);
        missing.push(d);
      }
      if (missing.length === 0) return;
      missing.forEach((d) => inFlightRef.current.add(monthKey(d)));
      setLoading(true);
      Promise.all(
        missing.map(async (d) => {
          try {
            const sheetId = await findMonthExpenseSheetId(accessToken, rootFolderId, d);
            const rows = sheetId ? await listExpenseRows(accessToken, sheetId) : [];
            cacheRef.current.set(monthKey(d), rows);
          } catch {
            // Leave it missing — the next ensureMonths call for this month
            // (e.g. revisiting the period) retries.
          } finally {
            inFlightRef.current.delete(monthKey(d));
          }
        })
      ).then(() => {
        setLoading(inFlightRef.current.size > 0);
        setVersion((v) => v + 1);
      });
    },
    [accessToken, rootFolderId]
  );

  useEffect(() => {
    if (!accessToken || !rootFolderId) return;
    const now = new Date();
    ensureMonths([now, prevMonthDate(now)]);
  }, [accessToken, rootFolderId, ensureMonths]);

  const getMonthRows = useCallback((date) => cacheRef.current.get(monthKey(date)), []);

  // Drops a month's cached rows and immediately re-fetches it — used after a
  // swipe-to-edit/delete mutation, since a spliced local update can't be
  // trusted (a delete/edit shifts every later row's sheet index in that same
  // month sheet; only a fresh read from Drive is safe).
  const invalidateMonth = useCallback(
    (date) => {
      cacheRef.current.delete(monthKey(date));
      ensureMonths([date]);
    },
    [ensureMonths]
  );

  return { getMonthRows, ensureMonths, invalidateMonth, loading };
}
