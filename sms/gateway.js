// Arkesel SMS adapter. Endpoint, api-key header and body fields as published at
// https://arkesel.com/developer-api/sms-api/ (confirm against the live docs before going live).
// Dry-run is the default: nothing is sent unless SMS_LIVE=1 AND ARKESEL_API_KEY is set.
const ENDPOINT = 'https://sms.arkesel.com/api/v2/sms/send';

function isLive(env = process.env) {
  return env.SMS_LIVE === '1' && !!env.ARKESEL_API_KEY;
}

async function sendOne({ to, text, sender, apiKey, fetchImpl = fetch }) {
  const res = await fetchImpl(ENDPOINT, {
    method: 'POST',
    headers: { 'api-key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ sender, message: text, recipients: [to] }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || body.status !== 'success') {
    return { ok: false, to, error: body.message || `HTTP ${res.status}` };
  }
  return { ok: true, to, id: body.data && body.data.id };
}

// Sends each planned message, one request each, and returns a result per message. A failure on one
// message never stops the rest; the caller records failures so they are retried on the next run.
async function sendAll(messages, { sender, apiKey, fetchImpl }) {
  const results = [];
  for (const m of messages) {
    try {
      results.push({ key: m.key, ...(await sendOne({ to: m.to, text: m.text, sender, apiKey, fetchImpl })) });
    } catch (err) {
      results.push({ key: m.key, ok: false, to: m.to, error: err.message });
    }
  }
  return results;
}

module.exports = { ENDPOINT, isLive, sendOne, sendAll };
