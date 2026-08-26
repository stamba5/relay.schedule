import { getSheetClient, SHEET_ID } from './_lib/google-sheets.js';

// Reads one tab of the (privately shared) schedule spreadsheet server-side,
// using a Google service account the sheet is shared with directly — so the
// sheet itself never has to be made public for the schedule page to stay live.
export default async function handler(req, res) {
  const sheetName = typeof req.query.sheet === 'string' ? req.query.sheet : '';
  if (!sheetName) {
    return res.status(400).json({ error: 'Missing "sheet" query parameter' });
  }

  let client;
  try {
    client = getSheetClient();
  } catch (err) {
    console.error('[api/sheet-data] service account not configured:', err.message);
    return res.status(500).json({ error: `Server's Google service account credentials are missing or invalid: ${err.message}` });
  }

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(sheetName)}`;
  try {
    const apiRes = await client.request({ url });
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    return res.status(200).json({ rows: apiRes.data.values || [] });
  } catch (err) {
    const status = err?.response?.status;
    const googleMessage = err?.response?.data?.error?.message
      || err?.response?.data?.error_description
      || err?.message
      || 'Unknown error';
    console.error(`[api/sheet-data] failed to fetch tab "${sheetName}" (status ${status}):`, googleMessage);
    if (status === 404) {
      return res.status(404).json({ error: `Tab "${sheetName}" not found in the spreadsheet.` });
    }
    if (status === 403) {
      return res.status(502).json({ error: `Google denied access to "${sheetName}": ${googleMessage} — check the sheet is shared with the service account email.` });
    }
    return res.status(502).json({ error: `Failed to read tab "${sheetName}": ${googleMessage}` });
  }
}
