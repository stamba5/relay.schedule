import { JWT } from 'google-auth-library';

// Same spreadsheet the public schedule page links to for editing.
const SHEET_ID = '1KfvIzU2WH1xocTDkDDdWRHAvc7B3MFU6IdDbyxM6PJg';

let cachedClient = null;

function getClient() {
  if (cachedClient) return cachedClient;

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const key = (process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY || '').replace(/\\n/g, '\n');
  if (!email || !key) {
    throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_EMAIL / GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY env vars');
  }

  cachedClient = new JWT({
    email,
    key,
    scopes: ['https://www.googleapis.com/auth/spreadsheets.readonly'],
  });
  return cachedClient;
}

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
    client = getClient();
  } catch (err) {
    console.error('[api/sheet-data] service account not configured:', err.message);
    return res.status(500).json({ error: 'Server is missing Google service account credentials.' });
  }

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(sheetName)}`;
  try {
    const apiRes = await client.request({ url });
    res.setHeader('Cache-Control', 's-maxage=60, stale-while-revalidate=120');
    return res.status(200).json({ rows: apiRes.data.values || [] });
  } catch (err) {
    const status = err?.response?.status;
    if (status === 400 || status === 404) {
      return res.status(404).json({ error: `Tab "${sheetName}" not found in the spreadsheet.` });
    }
    if (status === 403) {
      return res.status(502).json({ error: 'Google denied access — check the sheet is shared with the service account email.' });
    }
    console.error(`[api/sheet-data] failed to fetch tab "${sheetName}":`, err?.message || err);
    return res.status(502).json({ error: `Failed to read tab "${sheetName}" from Google Sheets.` });
  }
}
