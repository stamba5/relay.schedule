import crypto from 'crypto';

const SESSION_COOKIE_NAME = 'session';
const SESSION_TTL_SECONDS = 7 * 24 * 60 * 60; // 7 days

/**
 * Creates a signed, tamper-proof session token: "email:expiry:signature"
 * (base64url-encoded). No external session store needed — the signature
 * is verified with SESSION_SECRET on every request.
 */
export function createSessionToken(email, secret) {
  const expiry = Date.now() + SESSION_TTL_SECONDS * 1000;
  const payload = `${email}:${expiry}`;
  const signature = crypto.createHmac('sha256', secret).update(payload).digest('hex');
  return Buffer.from(`${payload}:${signature}`).toString('base64url');
}

export function verifySessionToken(token, secret) {
  try {
    const decoded = Buffer.from(token, 'base64url').toString('utf8');
    const lastColon = decoded.lastIndexOf(':');
    const signature = decoded.slice(lastColon + 1);
    const payload = decoded.slice(0, lastColon);
    const secondLastColon = payload.lastIndexOf(':');
    const email = payload.slice(0, secondLastColon);
    const expiryStr = payload.slice(secondLastColon + 1);

    const expectedSig = crypto.createHmac('sha256', secret).update(payload).digest('hex');
    if (signature !== expectedSig) return null;
    if (Date.now() > Number(expiryStr)) return null;
    return email;
  } catch {
    return null;
  }
}

export function getCookie(req, name) {
  const header = req.headers.cookie || '';
  const cookies = header.split(';').map((c) => c.trim());
  for (const c of cookies) {
    if (c.startsWith(`${name}=`)) {
      return decodeURIComponent(c.slice(name.length + 1));
    }
  }
  return null;
}

export function setSessionCookie(res, token) {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=${token}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=${SESSION_TTL_SECONDS}`
  );
}

export function clearSessionCookie(res) {
  res.setHeader(
    'Set-Cookie',
    `${SESSION_COOKIE_NAME}=; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=0`
  );
}

export { SESSION_COOKIE_NAME };
