import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { useRouter } from "next/router";
import { ScanLine, ArrowLeftRight, FileText, Plus, TrendingUp, TrendingDown, MoreHorizontal, Camera, Image as GalleryIcon } from "lucide-react";
import { useDrive } from "../lib/useDrive";
import { findMonthExpenseSheetId, listExpenseRows } from "../lib/google";
import { latestReceipts, categoryTotals, weeklyTotals, formatCurrency } from "../lib/insights";
import { setPendingCapture } from "../lib/pendingCapture";
import DriveFallback from "../components/DriveFallback";

// Ported 1:1 from lovable-design/src/routes/index.tsx: navy "Total Balance"
// hero card, 4-tile quick-action row, "Recent Expenses" list of white rows
// with a tinted first-letter square. Layout/classes verbatim; every number
// on the page is real (Drive-backed), not the mock's static figures.

function prevMonthDate(d) {
  return new Date(d.getFullYear(), d.getMonth() - 1, 1);
}

function greetingForHour(date = new Date()) {
  const h = date.getHours();
  if (h < 12) return "Good morning";
  if (h < 18) return "Good afternoon";
  return "Good evening";
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

  const [rows, setRows] = useState(null);
  const [error, setError] = useState("");
  const [addOpen, setAddOpen] = useState(false);

  const scanInputRef = useRef(null);
  const importInputRef = useRef(null);
  const addWrapRef = useRef(null);

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

  // Close the "Add" popover on an outside tap, same pattern as
  // components/BottomNav.js's center-fab popover.
  useEffect(() => {
    if (!addOpen) return;
    function handleOutside(e) {
      if (addWrapRef.current && !addWrapRef.current.contains(e.target)) setAddOpen(false);
    }
    document.addEventListener("mousedown", handleOutside);
    document.addEventListener("touchstart", handleOutside);
    return () => {
      document.removeEventListener("mousedown", handleOutside);
      document.removeEventListener("touchstart", handleOutside);
    };
  }, [addOpen]);

  function handleFileChosen(e) {
    const file = e.target.files[0];
    e.target.value = "";
    if (!file) return;
    setPendingCapture(file);
    setAddOpen(false);
    router.push("/capture");
  }

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

  const firstName = (user?.displayName || "").trim().split(/\s+/)[0] || profile.companyName;
  const latest = rows ? latestReceipts(rows, 5) : [];
  const now = new Date();
  const monthData = rows ? categoryTotals(rows, now) : null;
  const prevMonthTotal = rows ? categoryTotals(rows, prevMonthDate(now)).total : 0;
  const weekly = rows ? weeklyTotals(rows, now) : null;
  const pctChange =
    monthData && prevMonthTotal > 0
      ? Math.round(((monthData.total - prevMonthTotal) / prevMonthTotal) * 100)
      : null;
  const monthLabel = now.toLocaleString("en-US", { month: "long" }).toUpperCase();

  return (
    <div className="min-h-screen bg-background font-sans text-text-primary pb-28">
      <input
        ref={scanInputRef}
        type="file"
        accept="image/*"
        capture="environment"
        onChange={handleFileChosen}
        className="hidden"
      />
      <input
        ref={importInputRef}
        type="file"
        accept="image/*"
        onChange={handleFileChosen}
        className="hidden"
      />

      {/* Navy hero: everything above Recent Expenses sits on brand navy with
          a rounded bottom edge (owner request, reference screenshot). */}
      <div className="bg-brand-navy rounded-b-3xl pb-7 text-white">
        <div className="mx-auto max-w-md px-5 pt-10">
        <header className="mb-6 flex items-start justify-between">
          <div>
            <p className="text-xs text-white/60 mb-1">{profile.companyName}</p>
            <h1 className="text-2xl font-semibold tracking-tight">
              {greetingForHour()}, {firstName}
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
          <div className="mt-5 grid grid-cols-2 gap-3">
            <div className="rounded-xl bg-white/5 p-3 border border-white/5">
              <div className="flex items-center gap-1.5 text-[10px] text-white/60">
                <TrendingUp className="size-3" /> This week
              </div>
              <p className="text-sm font-semibold mt-1">
                {weekly ? formatCurrency(weekly.total, { decimals: 2 }) : "—"}
              </p>
            </div>
            <div className="rounded-xl bg-white/5 p-3 border border-white/5">
              <div className="flex items-center gap-1.5 text-[10px] text-white/60">
                <TrendingDown className="size-3" /> Last month
              </div>
              <p className="text-sm font-semibold mt-1">
                {rows ? formatCurrency(prevMonthTotal, { decimals: 2 }) : "—"}
              </p>
            </div>
          </div>
        </section>

        <section className="grid grid-cols-4 gap-3">
          <button className="flex flex-col items-center gap-2" onClick={() => scanInputRef.current?.click()}>
            <div className="size-12 rounded-xl grid place-items-center ring-1 bg-white text-text-primary ring-black/5">
              <ScanLine className="size-5" />
            </div>
            <span className="text-[11px] text-white/70">Scan</span>
          </button>
          <button className="flex flex-col items-center gap-2" onClick={() => importInputRef.current?.click()}>
            <div className="size-12 rounded-xl grid place-items-center ring-1 bg-white text-text-primary ring-black/5">
              <ArrowLeftRight className="size-5" />
            </div>
            <span className="text-[11px] text-white/70">Transfer</span>
          </button>
          <button className="flex flex-col items-center gap-2" onClick={() => router.push("/stats")}>
            <div className="size-12 rounded-xl grid place-items-center ring-1 bg-white text-text-primary ring-black/5">
              <FileText className="size-5" />
            </div>
            <span className="text-[11px] text-white/70">Report</span>
          </button>
          <div className="relative flex flex-col items-center gap-2" ref={addWrapRef}>
            {addOpen && (
              <div className="absolute bottom-[calc(100%+10px)] left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 z-50">
                <button
                  type="button"
                  onClick={() => scanInputRef.current?.click()}
                  className="flex items-center gap-2.5 whitespace-nowrap rounded-full bg-brand-teal text-white px-5 py-3 text-sm font-semibold shadow-xl cursor-pointer"
                >
                  <Camera className="size-4" /> Take photo
                </button>
                <button
                  type="button"
                  onClick={() => importInputRef.current?.click()}
                  className="flex items-center gap-2.5 whitespace-nowrap rounded-full bg-brand-navy text-white px-5 py-3 text-sm font-semibold shadow-xl cursor-pointer"
                >
                  <GalleryIcon className="size-4" /> Import from gallery
                </button>
              </div>
            )}
            <button
              className="flex flex-col items-center gap-2"
              onClick={() => setAddOpen((o) => !o)}
              aria-expanded={addOpen}
              aria-label="Add expense"
            >
              <div className="size-12 rounded-xl grid place-items-center ring-1 bg-brand-teal text-white ring-brand-teal">
                <Plus className="size-5" />
              </div>
              <span className="text-[11px] text-white/70">Add</span>
            </button>
          </div>
        </section>
        </div>
      </div>

      <div className="mx-auto max-w-md px-5 pt-6">
        {error && <div className="text-xs text-destructive mb-4">{error}</div>}

        <section className="mb-4">
          <div className="flex justify-between items-center mb-3">
            <h2 className="text-sm font-semibold">Recent Expenses</h2>
            <Link href="/history" className="text-xs text-brand-teal font-medium">
              View All
            </Link>
          </div>

          {rows === null && !error && (
            <p className="text-xs text-text-secondary">Loading receipts…</p>
          )}

          {rows && rows.length === 0 && (
            <div className="flex flex-col items-center text-center gap-2 py-10">
              <p className="text-sm font-semibold">No receipts yet</p>
              <p className="text-xs text-text-secondary max-w-[220px]">
                Tap the teal Add button above to snap your first one.
              </p>
            </div>
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
                      <div className={`size-10 rounded-lg grid place-items-center text-sm font-semibold ${tintForCategory(r.category)}`}>
                        {(r.place || "?").trim().charAt(0).toUpperCase()}
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

        <section className="bg-white rounded-2xl p-5 ring-1 ring-black/5 flex flex-col items-start gap-1">
          <p className="text-sm font-bold">Help us make BX better</p>
          <p className="text-xs text-text-secondary mb-2">Tell us what's confusing, broken, or missing.</p>
          <a
            href="mailto:alireza.mthr@gmail.com?subject=BX%20feedback"
            className="inline-flex items-center justify-center rounded-full bg-background ring-1 ring-black/5 text-text-primary text-xs font-semibold px-5 h-9"
          >
            Send feedback
          </a>
        </section>
      </div>
    </div>
  );
}
