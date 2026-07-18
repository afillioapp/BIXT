import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { TrendingUp, MoreHorizontal } from "lucide-react";
import { useDrive } from "../lib/useDrive";
import { useMonthRows } from "../lib/useMonthRows";
import { latestReceipts, categoryTotals, formatCurrency } from "../lib/insights";
import DriveFallback from "../components/DriveFallback";
import HomeCarousel from "../components/HomeCarousel";
import CategoryIcon from "../components/CategoryIcon";

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

// Stable per-category tint, cycling through the same style of pairs the
// design's own mock transactions used (bg-orange-50/text-orange-600,
// bg-zinc-100/text-zinc-700, bg-brand-teal-soft/text-brand-teal,
// bg-indigo-50/text-indigo-600), extended to cover the app's full
// 12-category list so every category always renders the same swatch.
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

  const { getMonthRows, ensureMonths } = useMonthRows(accessToken, rootFolderId);

  // Category filter for the Recent Expenses list (null = All).
  const [filterCat, setFilterCat] = useState(null);

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

  const visibleRows =
    rows && filterCat ? rows.filter((r) => (r.category || "Other") === filterCat) : rows;
  const latest = visibleRows ? latestReceipts(visibleRows, 5) : [];
  const monthData = rows ? categoryTotals(rows, now) : null;
  const prevMonthTotal = rows ? categoryTotals(rows, prevMonthDate(now)).total : 0;
  const pctChange =
    monthData && prevMonthTotal > 0
      ? Math.round(((monthData.total - prevMonthTotal) / prevMonthTotal) * 100)
      : null;
  const monthLabel = now.toLocaleString("en-US", { month: "long" }).toUpperCase();

  return (
    <div className="min-h-screen bg-background font-sans text-text-primary pb-28">
      {/* Navy hero: everything above Recent Expenses sits on brand navy with
          a rounded bottom edge (owner request, reference screenshot). */}
      <div className="bg-brand-navy rounded-b-3xl pb-7 text-white relative z-10 shadow-xl shadow-brand-navy/25">
        <div className="mx-auto max-w-md px-5 pt-10">
        <header className="mb-6 flex items-start justify-between">
          <div>
            <p className="text-xs text-white/60 mb-1">{profile.companyName}</p>
            <h1 className="text-2xl font-semibold tracking-tight">
              Hi, {firstName}
            </h1>
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
              <div className="size-10 rounded-full bg-white/15 text-white grid place-items-center text-sm font-semibold">
                {initialsFor(user?.displayName, profile.companyName)}
              </div>
            )}
          </Link>
        </header>

        <section className="bg-white/5 text-white rounded-2xl p-5 mb-6 ring-1 ring-white/10">
          <div className="flex justify-between items-start mb-4">
            <div>
              <p className="text-[10px] uppercase tracking-widest text-white/60 mb-1">
                Total Expenses · {monthLabel}
              </p>
              <p className="text-3xl font-medium leading-none">
                {monthData ? formatCurrency(monthData.total, { decimals: 2 }) : "—"}
              </p>
            </div>
            <div className="size-9 rounded-lg bg-brand-teal/20 border border-brand-teal/30 grid place-items-center text-brand-teal">
              <TrendingUp className="size-4" />
            </div>
          </div>
          {pctChange !== null && (
            <div className="flex items-center gap-2">
              <span className="text-[10px] font-medium bg-brand-teal/20 text-brand-teal px-2 py-0.5 rounded">
                {pctChange > 0 ? "+" : ""}
                {pctChange}%
              </span>
              <span className="text-[10px] text-white/60">vs last month</span>
            </div>
          )}
          <HomeCarousel getMonthRows={getMonthRows} ensureMonths={ensureMonths} />
        </section>
        </div>
      </div>

      <div className="mx-auto max-w-md px-5 pt-6">
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
                      ? "bg-brand-navy text-white"
                      : "bg-white ring-1 ring-black/5 text-text-secondary"
                  }`}
                >
                  {c}
                </button>
              );
            })}
          </div>
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

          {rows && rows.length > 0 && (
            <ul className="space-y-2.5">
              {latest.map((r, i) => (
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
          )}
        </section>
      </div>
    </div>
  );
}
