import { Resend } from 'resend';

let cachedClient = null;
function getClient() {
  if (cachedClient) return cachedClient;
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) throw new Error('Missing RESEND_API_KEY env var');
  cachedClient = new Resend(apiKey);
  return cachedClient;
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  }[ch]));
}

// changes: [{ dateLabel, oldText, newText }]
export async function sendScheduleChangeEmail({ to, name, changes }) {
  const client = getClient();
  const from = process.env.RESEND_FROM_EMAIL;
  if (!from) throw new Error('Missing RESEND_FROM_EMAIL env var');

  const subject = changes.length === 1
    ? `Your shift on ${changes[0].dateLabel} was changed`
    : `${changes.length} of your shifts were changed`;

  const textLines = changes.map((c) => `- ${c.dateLabel}: ${c.oldText} -> ${c.newText}`);
  const text = `Hi ${name},\n\nYour schedule was just updated:\n\n${textLines.join('\n')}\n\nCheck the full schedule for details.`;

  const htmlItems = changes
    .map((c) => `<li>${escapeHtml(c.dateLabel)}: <s>${escapeHtml(c.oldText)}</s> &rarr; <strong>${escapeHtml(c.newText)}</strong></li>`)
    .join('');
  const html = `<p>Hi ${escapeHtml(name)},</p><p>Your schedule was just updated:</p><ul>${htmlItems}</ul><p>Check the full schedule for details.</p>`;

  return client.emails.send({ from, to, subject, text, html });
}
