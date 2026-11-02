import { refreshYearOverview, withFreshToken } from "./google";
import { fiscalStartMonth, fiscalYear } from "./insights";

// Keeps the Overview tab up to date behind the scenes. Changes close together (a
// batch of receipts) wait for each other and become one rebuild, and a failure
// here never touches the receipt itself: Settings can always rebuild it. Does
// nothing until a business has moved to yearly files.
//
// drive: { accessToken, refreshAccessToken, rootFolderId, profile }

const WAIT_MS = 2500;
let waiting = [];
let timer = null;
let running = Promise.resolve();

export function scheduleReportRefresh(drive, { date = new Date() } = {}) {
  if (!drive?.rootFolderId || drive?.profile?.layout !== "yearly" || isNaN(date.getTime())) return;
  waiting.push({ drive, date });
  clearTimeout(timer);
  timer = setTimeout(flush, WAIT_MS);
}

// A receipt was edited or deleted.
export function scheduleRowChange(drive, row) {
  const date = new Date(`${row?.date}T00:00:00`);
  scheduleReportRefresh(drive, { date: isNaN(date.getTime()) ? new Date() : date });
}

function flush() {
  const jobs = waiting;
  waiting = [];
  const latest = jobs[jobs.length - 1].drive;
  const start = fiscalStartMonth(latest.profile);
  const years = new Map();
  for (const job of jobs) years.set(fiscalYear(start, 0, job.date).label, job.date);
  running = running.then(async () => {
    for (const date of years.values()) {
      try {
        await withFreshToken(latest.accessToken, latest.refreshAccessToken, (token) =>
          refreshYearOverview(token, { rootId: latest.rootFolderId, profile: latest.profile, date })
        );
      } catch (err) {
        console.warn("Couldn't update the overview", err);
      }
    }
  });
}
