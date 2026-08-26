// Server-side port of the sheet-parsing logic in public/schedule.html
// (parseCSVSheet / classifyValue / computeMonthSlots). Kept in lockstep with
// that file by hand — there's no build step shared between browser and API
// code in this project, so if you change the parsing rules there, mirror the
// change here too.

export const MONTH_NAMES = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
];

const DATE_CELL_RE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
const TIME_RANGE_RE = /^(\d{1,2}):(\d{2})\s*-\s*(\d{1,2}):(\d{2})$/;

// The three sheet tabs the app treats as "live": current month + next two.
export function computeMonthSlots(base = new Date()) {
  const slots = [];
  const baseMonth = base.getMonth();
  const baseYear = base.getFullYear();
  for (let i = 0; i < 3; i++) {
    const idx = (baseMonth + i) % 12;
    const year = baseYear + Math.floor((baseMonth + i) / 12);
    const abbr = MONTH_NAMES[idx].slice(0, 3);
    const sheetName = `Schedule ${abbr}${String(year).slice(-2)}`;
    slots.push({ monthIndex: idx, year, sheetName });
  }
  return slots;
}

export function parseCSVSheet(sheetName, rows) {
  // 1. Find the header row with the most DD/MM/YYYY cells, within the first 5 rows.
  let bestRow = -1, bestCols = [];
  for (let r = 0; r < Math.min(5, rows.length); r++) {
    const cols = [];
    (rows[r] || []).forEach((cell, c) => {
      const m = String(cell).trim().match(DATE_CELL_RE);
      if (m) cols.push({ c, d: m[1], m: m[2], y: m[3] });
    });
    if (cols.length > bestCols.length) { bestCols = cols; bestRow = r; }
  }
  if (bestRow === -1 || bestCols.length < 3) return null;

  const dateColumns = bestCols.map(({ c, d, m, y }) => ({
    col: c,
    date: new Date(Date.UTC(+y, +m - 1, +d)),
  }));

  // 2. First row after the header where column A is filled and isn't "Day of the week".
  let dataStartRow = -1;
  for (let r = bestRow + 1; r < rows.length; r++) {
    const v = (rows[r] || [])[0];
    if (v !== undefined && String(v).trim() !== '' && String(v).trim().toLowerCase() !== 'day of the week') {
      dataStartRow = r;
      break;
    }
  }
  if (dataStartRow === -1) return null;

  const hasRoleCol = bestCols[0].c >= 3;
  const entries = [];
  const workerNames = new Set();

  for (let r = dataStartRow; r < rows.length; r++) {
    const row = rows[r] || [];
    const v = row[0];
    if (v === undefined || String(v).trim() === '') continue;
    const label = String(v).trim();
    if (label === 'Code' || label === 'Shift Type') continue;

    const role = hasRoleCol ? (row[1] || '') : '';
    const codeRowIdx = ((rows[r + 1] || [])[0] === 'Code') ? r + 1 : null;
    const typeRowIdx = ((rows[r + 2] || [])[0] === 'Shift Type') ? r + 2 : null;

    const valuesByCol = {}, codesByCol = {}, typesByCol = {};
    dateColumns.forEach(({ col }) => {
      const cv = row[col];
      valuesByCol[col] = (cv === undefined || cv === '') ? null : cv;
      if (codeRowIdx !== null) {
        const cc = (rows[codeRowIdx] || [])[col];
        codesByCol[col] = (cc === undefined || cc === '') ? null : cc;
      }
      if (typeRowIdx !== null) {
        const tc = (rows[typeRowIdx] || [])[col];
        typesByCol[col] = (tc === undefined || tc === '') ? null : tc;
      }
    });

    entries.push({ name: label, role: String(role).trim(), valuesByCol, codesByCol, typesByCol });
    workerNames.add(label);
  }

  if (!entries.length) return null;
  return { sheetName, dateColumns, entries, workerNames };
}

export function classifyValue(v) {
  if (v === null || v === undefined) return { kind: 'off' };
  const s = String(v).trim();
  if (s === '') return { kind: 'off' };
  if (/^off$/i.test(s)) return { kind: 'off' };
  const m = s.match(TIME_RANGE_RE);
  if (m) return { kind: 'shift', startH: +m[1], startM: +m[2], endH: +m[3], endM: +m[4] };
  return { kind: 'allday', label: s };
}

// Human-readable text for a cell value, for use in notification emails.
export function formatShiftValue(v) {
  const c = classifyValue(v);
  if (c.kind === 'off') return 'Not working (day off)';
  if (c.kind === 'shift') {
    const pad = (n) => String(n).padStart(2, '0');
    return `${pad(c.startH)}:${pad(c.startM)} - ${pad(c.endH)}:${pad(c.endM)}`;
  }
  return c.label;
}

// Cells that mean the same thing ("off" / null / "" / "OFF") should not be
// reported as a change just because the boss typed a different blank value.
export function normalizeForComparison(v) {
  if (v === null || v === undefined) return '';
  const s = String(v).trim();
  return /^off$/i.test(s) ? '' : s;
}
