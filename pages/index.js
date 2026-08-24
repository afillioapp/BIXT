import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { useDrive } from "../lib/useDrive";
import { useMonthRows } from "../lib/useMonthRows";
import { deleteExpenseRow } from "../lib/google";
import { latestReceipts, categoryTotals, formatCurrency } from "../lib/insights";
import DriveFallback from "../components/DriveFallback";
import PageHeader from "../components/PageHeader";
import HomeCarousel from "../components/HomeCarousel";
import { accentForCategory, paletteColor } from "../components/CategoryIcon";
import ExpenseRow, { rowIdFor } from "../components/ExpenseRow";
import EditExpenseSheet from "../components/EditExpenseSheet";

// Originally ported 1:1 from lovable-design/src/routes/index.tsx (navy
// "Total Balance" hero + 4-tile quick-action row + "Recent Expenses" list).
// Round 5 (owner request): the hero's inner "This week"/"Last month" tiles
// and the quick-action row are gone, replaced by a swipeable 3-panel
// carousel (components/HomeCarousel.js) inside the hero. Capture is reached
// through the bottom-nav "+" popover only (components/BottomNav.js) — no
// separate capture entry point on this page. Every number on the page is
// real (Drive-backed).

function prevMonthDate(d) {
  return new Date(d.getFullYear(), d.getMonth() - 1, 1);
}

// "Jane Doe" -> "JD"; a single name -> first two letters; nothing -> "?".
// Fallback avatar for phone sign-in users, who have no Google photoURL.
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

  const { getMonthRows, ensureMonths, invalidateMonth } = useMonthRows(accessToken, rootFolderId);

  // Category filter for the Recent Expenses list (null = All).
  const [filterCat, setFilterCat] = useState(null);

  // Swipe-to-act row state: which row (if any) is swiped open, which row (if
  // any) has its edit sheet up, and a place for delete errors to surface —
  // the row itself only shows a spinner/retry state, not the message.
  const [openRowId, setOpenRowId] = useState(null);
  const [editingRow, setEditingRow] = useState(null);
  const [actionError, setActionError] = useState("");

  // Mutations (edit/delete) always refresh both months Home shows — simpler
  // than tracking which month a specific row's date falls in, and rows are
  // never spliced locally: a delete/edit shifts every later row's sheet
  // index in that same month sheet, so only a fresh read from Drive is safe.
  function refreshVisibleMonths() {
    const n = new Date();
    invalidateMonth(n);
    invalidateMonth(prevMonthDate(n));
  }

  async function handleDeleteRow(row) {
    setActionError("");
    try {
      await deleteExpenseRow(accessToken, row.sheetId, row.rowIndex);
      refreshVisibleMonths();
    } catch (err) {
      setActionError(err.message || "Couldn't delete — try again");
      throw err;
    }
  }

  function handleSavedRow() {
    setEditingRow(null);
    refreshVisibleMonths();
  }

  // Only send someone to onboarding when we positively know they have no BX
  // folder — i.e. Drive answered us. A connection problem (loadError) or a
  // missing token (needsConnect) must never re-onboard an existing customer.
  useEffect(() => {
    if (!profileLoading && !profile && accessToken && !loadError && !needsConnect) {
      router.replace("/setup");
    }
  }, [profileLoading, profile, accessToken, loadError, needsConnect]);

  if (profileLoading || !profile) {
    return (
      <div className="min-h-screen bg-background font-sans text-text-primary pb-28">
        <div className="mx-auto max-w-md px-5 pt-10">
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

  const now = new Date();
  const currentMonthRows = getMonthRows(now);
  const prevMonthRows = getMonthRows(prevMonthDate(now));
  const rows = currentMonthRows && prevMonthRows ? [...currentMonthRows, ...prevMonthRows] : null;

  const firstName = (user?.displayName || "").trim().split(/\s+/)[0] || profile.companyName;

  // Filter pills: the categories present across the loaded rows, biggest
  // spend first (both months, matching what the list itself can show).
  const catSpend = new Map();
  for (const r of rows || []) {
    const c = r.category || "Other";
    const n = parseFloat(String(r.total ?? "").replace(/^'/, "").replace(/[$,\s]/g, ""));
    catSpend.set(c, (catSpend.get(c) || 0) + (Number.isFinite(n) ? n : 0));
  }
  const filterCats = [...catSpend.entries()].sort((a, b) => b[1] - a[1]).map(([c]) => c).slice(0, 6);

  // An active filter narrows the WHOLE page (owner request): the total, the
  // %-chip, the hero charts, and the list all speak about that one category.
  const visibleRows =
    rows && filterCat ? rows.filter((r) => (r.category || "Other") === filterCat) : rows;
  const latest = visibleRows ? latestReceipts(visibleRows, 5) : [];
  const monthData = visibleRows ? categoryTotals(visibleRows, now) : null;
  const prevMonthTotal = visibleRows ? categoryTotals(visibleRows, prevMonthDate(now)).total : 0;
  const pctChange =
    monthData && prevMonthTotal > 0
      ? Math.round(((monthData.total - prevMonthTotal) / prevMonthTotal) * 100)
      : null;
  const monthLabel = now.toLocaleString("en-US", { month: "long" });
  // The eyebrow label above the total was removed at owner request. The string
  // survives as the headline's accessible name, so a screen reader still says
  // what the number is instead of reading a bare amount.
  const totalLabel = filterCat
    ? `Total ${filterCat} expenses, ${monthLabel}`
    : `Total expenses, ${monthLabel}`;
  const filterAccent = filterCat ? accentForCategory(filterCat) : null;
  // Share-of-spend for the whole month, deliberately NOT narrowed by
  // filterCat. The rest of the page narrows, but a breakdown whose only bar
  // reads 100% tells you nothing — the card's entire job is the proportion
  // between categories, which a filter destroys. The filter shows up as
  // emphasis on its row instead.
  const monthBreakdown = rows ? categoryTotals(rows, now) : null;

  return (
    <div className="min-h-screen bg-background font-sans text-text-primary pb-28">
      {/* The month total IS the headline: no greeting, no company, and since
          the owner removed the eyebrow, no label either. Just the money. */}
      <PageHeader>
        <header className="flex items-start justify-between">
          <div>
            <h1
              className="text-3xl font-semibold tracking-tight leading-none"
              aria-label={
                monthData
                  ? `${totalLabel}: ${formatCurrency(monthData.total, { decimals: 2 })}`
                  : totalLabel
              }
              style={filterAccent ? { color: filterAccent } : undefined}
            >
              {monthData ? formatCurrency(monthData.total, { decimals: 2 }) : "—"}
            </h1>
            {monthData && (
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] font-medium bg-brand-teal-soft text-brand-teal-deep px-2 py-0.5 rounded">
                  {pctChange !== null ? `${pctChange > 0 ? "+" : ""}${pctChange}%` : "—"}
                </span>
                <span className="text-[10px] text-text-secondary">vs last month</span>
              </div>
            )}
          </div>
          <Link href="/settings" aria-label="Settings" className="shrink-0">
            {user?.photoURL ? (
              <img
                src={user.photoURL}
                alt=""
                referrerPolicy="no-referrer"
                width={40}
                height={40}
                className="size-10 rounded-full object-cover"
              />
            ) : (
              <div className="size-10 rounded-full bg-brand-navy text-white grid place-items-center text-sm font-semibold">
                {initialsFor(user?.displayName, profile.companyName)}
              </div>
            )}
          </Link>
        </header>
      </PageHeader>

      <div className="mx-auto max-w-md px-5 pt-6">
        <div className="mb-6">
          <HomeCarousel getMonthRows={getMonthRows} ensureMonths={ensureMonths} filterCategory={filterCat} />
        </div>

        {rows && rows.length > 0 && (
          <div className="flex gap-2 overflow-x-auto pb-4 -mx-5 px-5 scrollbar-none">
            {["All", ...filterCats].map((c) => {
              const active = c === "All" ? filterCat === null : filterCat === c;
              return (
                <button
                  key={c}
                  type="button"
                  onClick={() => setFilterCat(c === "All" ? null : c)}
                  className={`px-4 py-2 rounded-full text-xs font-medium shrink-0 ${
                    active
                      ? c === "All"
                        ? "bg-brand-navy text-white"
                        : "text-brand-navy font-semibold"
                      : "bg-white ring-1 ring-black/5 text-text-secondary"
                  }`}
                  style={active && c !== "All" ? { background: accentForCategory(c) } : undefined}
                >
                  {c}
                </button>
              );
            })}
          </div>
        )}

        {monthBreakdown && monthBreakdown.categories.length > 0 && (
          <section className="mb-6">
            <h2 className="text-sm font-semibold mb-3">Top Categories</h2>
            <div className="space-y-4 bg-white p-5 rounded-2xl ring-1 ring-black/5">
              {monthBreakdown.categories.slice(0, 5).map((c, i) => {
                const active = filterCat === c.category;
                return (
                  <div key={c.category}>
                    <div className="flex justify-between gap-3 mb-1.5">
                      <span className={`text-xs min-w-0 truncate ${active ? "font-semibold" : "font-medium"}`}>
                        {c.category}
                      </span>
                      <span className="text-xs font-semibold shrink-0">{Math.round(c.percent)}%</span>
                    </div>
                    {/* Decorative: the row already states the category and the
                        share in text, so the bar is not the only carrier. */}
                    <div className="w-full bg-zinc-100 h-1.5 rounded-full overflow-hidden" aria-hidden="true">
                      <div
                        className="h-full rounded-full"
                        style={{ width: `${c.percent}%`, background: paletteColor(i) }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        <section className="mb-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-sm font-semibold">Recent Expenses</h2>
            <Link href="/history" className="text-xs text-brand-teal font-medium">
              View All
            </Link>
          </div>

          {rows === null && (
            <p className="text-xs text-text-secondary">Loading receipts…</p>
          )}

          {rows && rows.length === 0 && (
            <div className="flex flex-col items-center text-center gap-2 py-10">
              <p className="text-sm font-semibold">No receipts yet</p>
              <p className="text-xs text-text-secondary max-w-[220px]">
                Tap the + button below to snap your first one.
              </p>
            </div>
          )}

          {rows && rows.length > 0 && latest.length === 0 && (
            <p className="text-xs text-text-secondary py-6 text-center">
              No {filterCat} expenses in the last two months.
            </p>
          )}

          {actionError && <p className="text-xs text-destructive mb-2">{actionError}</p>}

          {rows && rows.length > 0 && (
            <ul className="space-y-2.5">
              {latest.map((r) => (
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
          )}
        </section>
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
