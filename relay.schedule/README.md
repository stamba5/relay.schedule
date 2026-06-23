# Google Sign-In + email allowlist for relay.schedule

This is wired directly into your uploaded `index.html` — not a generic
template. What's in here:

- Your real schedule data (all months, all agents) was pulled out of the
  `<script type="application/json" id="bakedData">` tag that used to be
  embedded in the page, and now lives in `data/schedule.json`. It is no
  longer shipped to the browser on page load.
- `public/schedule.html` is your original page. `loadBakedData()` now
  fetches from `/api/schedule` instead of reading that inline tag, and
  there's a small session check at the top that redirects to
  `/index.html` if there's no valid login. Everything else — the agent
  search, month checkboxes, the "use bundled data instead" xlsx upload
  override, the ICS generation — is untouched.
- `public/index.html` is a new login screen with the Google Sign-In button.
- `api/login.js` — verifies the Google ID token server-side, checks it
  against `ALLOWED_EMAILS`, sets a signed session cookie.
- `api/me.js` — lets the front-end check "am I logged in?"
- `api/schedule.js` — only returns `data/schedule.json` if the session
  cookie is valid.
- `api/logout.js` — clears the cookie.

## 1. Merge this into your repo

Copy `api/`, `data/`, `public/`, and `package.json` into the root of
`relay.schedule`, replacing your current `index.html` with what's now
`public/schedule.html`.

**Important:** in your Vercel project settings, set **Output Directory** to
`public`. Only what's inside `public/` gets served as static files — `api/`
and `data/` stay server-side only. This is what actually closes the leak:
`data/schedule.json` (your real roster — names, roles, every shift for all
three months) sits outside `public/`, so it's only ever reachable through
the authenticated `/api/schedule` endpoint, never as a raw static file.

## 2. Set up the Google OAuth client

1. Go to [console.cloud.google.com](https://console.cloud.google.com) → create or select a project.
2. **APIs & Services → OAuth consent screen** → choose External (or Internal if everyone has a Relay Google Workspace account) → fill in the basic app info.
3. **APIs & Services → Credentials → Create Credentials → OAuth client ID** → Application type: **Web application**.
4. Under **Authorized JavaScript origins**, add your Vercel production URL, e.g. `https://relay-schedule.vercel.app` (and your custom domain if you have one).
5. Copy the generated Client ID (ends in `.apps.googleusercontent.com`).

This Client ID is not secret — it's meant to be public and goes straight into `public/index.html`. There's no client *secret* involved in this flow.

## 3. Set environment variables in Vercel

Project → Settings → Environment Variables:

| Name | Value |
|---|---|
| `GOOGLE_CLIENT_ID` | the Client ID from step 2 |
| `ALLOWED_EMAILS` | comma-separated list, e.g. `agent1@relay.com,agent2@relay.com` |
| `SESSION_SECRET` | a long random string — generate one with `openssl rand -hex 32` |

Then in `public/index.html`, replace `YOUR_GOOGLE_CLIENT_ID` in the
`data-client_id` attribute with the same Client ID (it's fine for this one
to be hardcoded in the HTML).

## 4. Deploy and test

Push to GitHub as usual. Once deployed:

- Visiting `/schedule.html` with no session redirects to `/index.html`.
- Signing in with a non-allowlisted Google account shows the "not authorized" message.
- Signing in with an allowlisted account sets a cookie and loads your real schedule data via `/api/schedule`.
- The "use bundled data instead" xlsx upload flow still works exactly as before — it just calls the same (now-async) loader.
- A "Sign out" link sits right under the data-source toggle.
- The cookie lasts 7 days (`SESSION_TTL_SECONDS` in `api/_lib/session.js`) — adjust if you want shorter/longer sessions.

## Notes / limitations

- This protects the *data*, not just the page shell — even if someone views source on `schedule.html`, there's nothing sensitive in it until `/api/schedule` returns data, and that only happens with a valid cookie.
- To add or remove an agent's access, just edit `ALLOWED_EMAILS` in Vercel and redeploy (or move it to a small JSON/DB-backed list later if the team grows).
- If you ever want to layer in your existing Vercel Deployment Protection setting too, that's independent of this and can stay as a second wall — just make sure it's *not* set to require a Vercel login for production if you want this Google gate to be the only thing visitors hit.
