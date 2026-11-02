import { refreshAnnualReport, withFreshToken } from "./google";
import { fiscalStartMonth, fiscalYear } from "./insights";

// Keeps the annual report up to date behind the scenes. Changes close together
// (a batch of receipts) wait for each other and become one rebuild, and a
// failure here never touches the receipt itself: Settings > Annual report can
// always rebuild it.
//
// drive: { accessToken, refreshAccessToken, rootFolderId, profile }

const WAIT_MS = 2500;
let waiting = [];
let timer = null;
let running = Promise.resolve();

export function scheduleReportRefresh(drive, { date = new Date(), full = false } = {}) {
  if (!drive?.rootFolderId || !drive?.profile || isNaN(date.getTime())) return;
  waiting.push({ drive, date, full });
  clearTimeout(timer);
  timer = setTimeout(flush, WAIT_MS);
}

// A receipt was edited or deleted. Its date may not match the sheet it lives in
// (an edit can change the date without moving the row), so re-read the whole year.
export function scheduleRowChange(drive, row) {
  const date = new Date(`${row?.date}T00:00:00`);
  scheduleReportRefresh(drive, { date: isNaN(date.getTime()) ? new Date() : date, full: true });
}

function flush() {
  const jobs = waiting;
  waiting = [];
  const latest = jobs[jobs.length - 1].drive;
  const start = fiscalStartMonth(latest.profile);
  const years = new Map();
  for (const job of jobs) {
    const key = fiscalYear(start, 0, job.date).label;
    const year = years.get(key) || { dates: [], full: false };
    year.dates.push(job.date);
    year.full = year.full || job.full;
    years.set(key, year);
  }
  running = running.then(async () => {
    for (const { dates, full } of years.values()) {
      try {
        await withFreshToken(latest.accessToken, latest.refreshAccessToken, (token) =>
          refreshAnnualReport(token, { rootId: latest.rootFolderId, profile: latest.profile, dates, full })
        );
      } catch (err) {
        console.warn("Couldn't update the annual report", err);
      }
    }
  });
}
