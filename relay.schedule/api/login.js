import { OAuth2Client } from 'google-auth-library';
import { createSessionToken, setSessionCookie } from './_lib/session.js';

const client = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { credential } = req.body || {};
  if (!credential) {
    return res.status(400).json({ error: 'Missing credential' });
  }

  try {
    // Verifies the JWT signature against Google's public keys and checks
    // that it was issued for OUR client ID. This is the part a client-side
    // check could never safely do on its own.
    const ticket = await client.verifyIdToken({
      idToken: credential,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    const payload = ticket.getPayload();
    const email = payload?.email;
    const emailVerified = payload?.email_verified;

    if (!email || !emailVerified) {
      return res.status(401).json({ error: 'Email not verified' });
    }

    const allowedEmails = (process.env.ALLOWED_EMAILS || '')
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean);

    if (!allowedEmails.includes(email.toLowerCase())) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const token = createSessionToken(email, process.env.SESSION_SECRET);
    setSessionCookie(res, token);

    return res.status(200).json({ ok: true, email });
  } catch (err) {
    console.error('Login error:', err);
    return res.status(401).json({ error: 'Invalid token' });
  }
}
