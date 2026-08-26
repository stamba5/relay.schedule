import { put, list } from '@vercel/blob';

// Where the "last known" cell-by-cell snapshot of the live schedule is kept,
// so a later run can diff against it. There's no database in this project,
// so Vercel Blob (attached to this project as a storage integration) stands
// in for one — see NOTIFICATIONS.md for setup.
const SNAPSHOT_PATH = 'schedule-notify/last-snapshot.json';

export async function loadSnapshot() {
  const { blobs } = await list({ prefix: SNAPSHOT_PATH, limit: 1 });
  const match = blobs.find((b) => b.pathname === SNAPSHOT_PATH);
  if (!match) return null;
  const res = await fetch(match.url, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json();
}

export async function saveSnapshot(snapshot) {
  await put(SNAPSHOT_PATH, JSON.stringify(snapshot), {
    access: 'public',
    addRandomSuffix: false,
    allowOverwrite: true,
    contentType: 'application/json',
  });
}
