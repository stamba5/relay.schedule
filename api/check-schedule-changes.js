import fs from 'fs';
import path from 'path';
import { fetchSheetRows } from './_lib/google-sheets.js';
import { computeMonthSlots, parseCSVSheet, formatShiftValue, normalizeForComparison } from './_lib/schedule-parse.js';
import { loadSnapshot, saveSnapshot } from './_lib/notify-store.js';
import { sendScheduleChangeEmail } from './_lib/email.js';

function loadEmployeeEmails() {
  const p = path.join(process.cwd(), 'data', 'employee-emails.json');
  try {
    return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch {
    return {};
  }
}

// Vercel automatically sends "Authorization: Bearer $CRON_SECRET" on cron
// invocations when CRON_SECRET is set — this rejects any other caller.
function isAuthorized(req) {
  const secret = process.env.CRON_SECRET;
  if (!secret) return true;
  return req.headers.authorization === `Bearer ${secret}`;
}

function formatDateLabel(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', timeZone: 'UTC' });
}

// Pulls the current live schedule (same 3 sheet tabs the app shows), diffs
// it cell-by-cell against the last snapshot we saved, and emails anyone
// whose shift changed since then. Meant to be hit on a schedule (see
// vercel.json) rather than by users directly.
export default async function handler(req, res) {
  if (!isAuthorized(req)) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const slots = computeMonthSlots();
  const results = await Promise.allSettled(slots.map((s) => fetchSheetRows(s.sheetName)));

  const currentCells = {};
  const sheetErrors = [];
  results.forEach((r, i) => {
    const sheetName = slots[i].sheetName;
    if (r.status !== 'fulfilled') {
      sheetErrors.push(`${sheetName}: ${r.reason?.message || r.reason}`);
      return;
    }
    const parsed = parseCSVSheet(sheetName, r.value);
    if (!parsed) return;
    parsed.dateColumns.forEach(({ col, date }) => {
      const iso = date.toISOString().slice(0, 10);
      parsed.entries.forEach((entry) => {
        currentCells[`${sheetName}|${iso}|${entry.name}`] = entry.valuesByCol[col] ?? null;
      });
    });
  });

  let previous;
  try {
    previous = await loadSnapshot();
  } catch (err) {
    console.error('[check-schedule-changes] failed to load previous snapshot:', err);
    return res.status(500).json({ error: `Could not read stored snapshot: ${err.message}` });
  }
  const isFirstRun = !previous;
  const previousCells = previous?.cells || {};

  const changesByEmployee = {};
  if (!isFirstRun) {
    for (const [key, currentValue] of Object.entries(currentCells)) {
      // No prior value for this cell (new date entering the rolling window,
      // or a new employee row) — nothing to diff against, not a "change".
      if (!(key in previousCells)) continue;

      const previousValue = previousCells[key];
      if (normalizeForComparison(previousValue) === normalizeForComparison(currentValue)) continue;

      const [, iso, name] = key.split('|');
      (changesByEmployee[name] ||= []).push({
        dateLabel: formatDateLabel(iso),
        isoDate: iso,
        oldText: formatShiftValue(previousValue),
        newText: formatShiftValue(currentValue),
      });
    }
  }

  const emails = loadEmployeeEmails();
  const notified = [];
  const skippedNoEmail = [];
  const sendErrors = [];

  await Promise.allSettled(
    Object.entries(changesByEmployee).map(async ([name, changes]) => {
      const to = emails[name];
      if (!to) {
        skippedNoEmail.push(name);
        return;
      }
      changes.sort((a, b) => a.isoDate.localeCompare(b.isoDate));
      try {
        await sendScheduleChangeEmail({ to, name, changes });
        notified.push(name);
      } catch (err) {
        console.error(`[check-schedule-changes] failed to email ${name}:`, err);
        sendErrors.push(`${name}: ${err.message}`);
      }
    })
  );

  try {
    await saveSnapshot({ generatedAt: new Date().toISOString(), cells: currentCells });
  } catch (err) {
    console.error('[check-schedule-changes] failed to save snapshot:', err);
    return res.status(500).json({ error: `Could not persist new snapshot: ${err.message}` });
  }

  return res.status(200).json({
    firstRun: isFirstRun,
    employeesChanged: Object.keys(changesByEmployee).length,
    notified,
    skippedNoEmail,
    sendErrors,
    sheetErrors,
  });
}
