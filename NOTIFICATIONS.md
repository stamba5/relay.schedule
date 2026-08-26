# Schedule-change email notifications

When the boss edits a shift directly in the Google Sheet, employees get an
email the next time `/api/check-schedule-changes` runs (on a schedule, via
Vercel Cron). It compares the live sheet against the last-seen snapshot and
emails anyone whose cell changed (new times, marked "off", changed to a
different shift, etc.).

## One-time setup

1. **Fill in employee emails** — edit `data/employee-emails.json` and put
   each employee's email address next to their name (must match the name
   exactly as it appears in the schedule). Anyone left blank is skipped (and
   shows up in `skippedNoEmail` in the endpoint's response) — no notification
   is silently lost, but nothing is sent until the address is filled in.

2. **Add a Vercel Blob store** (used to remember the last-seen schedule so
   changes can be diffed) — in the Vercel dashboard: Project → Storage →
   Create Database → Blob → connect it to this project. This sets the
   `BLOB_READ_WRITE_TOKEN` env var automatically.

3. **Create a Resend account** (https://resend.com) for sending the emails,
   then set these env vars in Vercel:
   - `RESEND_API_KEY` — from the Resend dashboard.
   - `RESEND_FROM_EMAIL` — a sender address on a domain you've verified in
     Resend (e.g. `schedule@yourcompany.com`).

4. **Set `CRON_SECRET`** to a random string (any password generator) — this
   stops anyone else from triggering the endpoint and forcing extra emails.
   Vercel automatically sends it as a bearer token when it fires the cron job.

## Cron frequency

`vercel.json` runs the check once a day (06:00 UTC), because the **Hobby
plan only allows daily cron jobs**. If this project is on a **Pro plan**,
you can make it check more often — for example every 15 minutes:

```json
{ "crons": [{ "path": "/api/check-schedule-changes", "schedule": "*/15 * * * *" }] }
```

## How the diffing works

- The first time it ever runs, there's nothing to compare against yet, so it
  just records the current schedule as the baseline and sends no emails.
- After that, every run re-reads the same 3 sheet tabs the app shows
  (current month + next 2) and compares each employee/date cell to the
  stored snapshot. Any cell whose value actually changed (e.g. `08:00 -
  16:00` → `14:00 - 22:00`, or → "off") gets reported; a date that's simply
  new to the 3-month window (because time moved forward) is not treated as
  a change.
- An employee with multiple changed shifts in the same run gets one email
  listing all of them, not one email per shift.

## Testing it manually

You can hit the endpoint directly (bypassing the cron schedule) with:

```
curl -X POST https://<your-deployment>/api/check-schedule-changes \
  -H "Authorization: Bearer $CRON_SECRET"
```

It returns a JSON summary: `employeesChanged`, `notified`, `skippedNoEmail`,
`sendErrors`, `sheetErrors`.
