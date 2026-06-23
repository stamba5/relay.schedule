import { getCookie, verifySessionToken } from './_lib/session.js';

export default function handler(req, res) {
  const token = getCookie(req, 'session');
  const email = token ? verifySessionToken(token, process.env.SESSION_SECRET) : null;

  if (!email) {
    return res.status(401).json({ authenticated: false });
  }
  return res.status(200).json({ authenticated: true, email });
}
