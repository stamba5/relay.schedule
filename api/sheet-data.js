import { JWT } from 'google-auth-library';

// Same spreadsheet the public schedule page links to for editing.
const SHEET_ID = '1KfvIzU2WH1xocTDkDDdWRHAvc7B3MFU6IdDbyxM6PJg';

let cachedClient = null;

// The full service-account JSON key file, base64-encoded into one env var.
// Avoids the newline/quote mangling that copying just the "private_key"
// field into a separate env var is prone to (multi-line PEM keys get
// corrupted very easily by paste, trimming, or single-line text inputs).
function getClient() {
  if (cachedClient) return cachedClient;

  const encoded = process.env.GOOGLE_SERVICE_ACCOUNT_KEY_BASE64;
  if (!encoded) {
    throw new Error('Missing GOOGLE_SERVICE_ACCOUNT_KEY_BASE64 env var');
  }

  let creds;
  try {
    creds = JSON.parse(Buffer.from(encoded, 'base64').toString('utf8'));
  } catch {
    throw new Error('GOOGLE_SERVICE_ACCOUNT_KEY_BASE64 is not valid base64-encoded JSON');
  }
  if (!creds.client_email || !creds.private_key) {
    throw new Error('Decoded service account JSON is missing client_email or private_key');
  }

  cachedClient = new JWT({
    email: creds.client_email,
    key: creds.private_key,
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
