import { JWT } from 'google-auth-library';

// Same spreadsheet the public schedule page links to for editing.
export const SHEET_ID = '1KfvIzU2WH1xocTDkDDdWRHAvc7B3MFU6IdDbyxM6PJg';

let cachedClient = null;

// The full service-account JSON key file, base64-encoded into one env var.
// Avoids the newline/quote mangling that copying just the "private_key"
// field into a separate env var is prone to (multi-line PEM keys get
// corrupted very easily by paste, trimming, or single-line text inputs).
export function getSheetClient() {
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

// Reads one tab's raw values, the same way /api/sheet-data does for the browser.
export async function fetchSheetRows(sheetName) {
  const client = getSheetClient();
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${SHEET_ID}/values/${encodeURIComponent(sheetName)}`;
  const apiRes = await client.request({ url });
  return apiRes.data.values || [];
}
