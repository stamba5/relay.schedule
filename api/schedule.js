import fs from 'fs';
import path from 'path';
import { getCookie, verifySessionToken } from './_lib/session.js';

export default function handler(req, res) {
  const token = getCookie(req, 'session');
  const email = token ? verifySessionToken(token, process.env.SESSION_SECRET) : null;

  if (!email) {
    return res.status(401).json({ error: 'Not authenticated' });
  }

  // TODO: swap this for however you currently produce the schedule data
  // (e.g. the parsed output of your Excel workbook). The important part:
  // this file lives in /data, OUTSIDE the /public folder that Vercel
  // serves statically — so it is ONLY ever reachable through this
  // authenticated endpoint, never as a raw static file.
  const dataPath = path.join(process.cwd(), 'data', 'schedule.json');
  const scheduleData = JSON.parse(fs.readFileSync(dataPath, 'utf8'));

  return res.status(200).json(scheduleData);
}
