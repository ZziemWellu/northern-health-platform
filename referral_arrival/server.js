// HTTP wrapper for the referral arrival loop. No framework: node:http, a JSON file store, and one key
// per kind of caller. SMS is dry-run unless SMS_LIVE=1 and ARKESEL_API_KEY are set (same rule as sms/).
//
// Routes
//   POST /referrals          CHPS nurse key   create a referral, sends the facility its code
//   POST /confirm            facility key     facility enters the code; no account needed
//   POST /escalate           cron key         alerts the nurse about overdue referrals, and retries
//                                             any facility notice or escalation that was not delivered
//   GET  /referrals/:id      nurse key        status of one referral (never the code)
//
// Safety rules
//   - A message counts as sent only when the gateway accepted it. Failed facility notices and failed
//     escalations stay pending and are retried by every /escalate run. /escalate answers 502 while
//     anything is still undelivered, so the cron job (or its monitoring) can alert a person.
//   - If a nurse has no phone on file, the escalation goes to ESCALATION_FALLBACK_PHONE (the district
//     or supervisor line) when it is set; otherwise it stays pending and is reported.
//   - One request at a time: the store is read, changed and written inside a queue, and written to a
//     temporary file first, so a crash or two simultaneous requests cannot lose a referral. This
//     assumes ONE server process per store file.
//   - Wrong codes are limited per facility in a rolling window, and a facility can only look up its
//     own referrals, so it cannot learn whether a code belongs to another facility.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const arrival = require('./arrival');
const sms = require('../sms/gateway');

const MAX_BODY_BYTES = 16 * 1024;
const LOOKUP_WINDOW_MS = 60 * 60 * 1000;
const MAX_LOOKUP_FAILURES_PER_WINDOW = 20;

function loadStore(file) {
  if (!fs.existsSync(file)) return { referrals: {}, outbox: [], lookupFailures: {} };
  const store = JSON.parse(fs.readFileSync(file, 'utf8'));
  store.referrals = store.referrals || {};
  store.outbox = store.outbox || [];
  // Older stores kept a lifetime count per facility; a rolling window replaces it.
  if (!store.lookupFailures || Object.values(store.lookupFailures).some(v => !Array.isArray(v))) {
    store.lookupFailures = {};
  }
  return store;
}

// Write to a temporary file, then rename over the store: a crash mid-write leaves the old store whole.
function saveStore(file, store) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(store, null, 2));
  fs.renameSync(tmp, file);
}

// Constant-time comparison, so a key cannot be guessed one character at a time from response times.
function keyMatches(given, expected) {
  if (typeof given !== 'string' || typeof expected !== 'string' || !expected) return false;
  const a = crypto.createHash('sha256').update(given).digest();
  const b = crypto.createHash('sha256').update(expected).digest();
  return crypto.timingSafeEqual(a, b);
}

// Dry-run logs every message to the outbox and counts as delivered; live sends through the gateway.
async function deliver(store, { to, text }, env, fetchImpl) {
  if (!sms.isLive(env)) {
    store.outbox.push({ to, text, sent: false, dryRun: true, at: new Date().toISOString() });
    return { ok: true, dryRun: true };
  }
  let res;
  try {
    res = await sms.sendOne({ to, text, sender: env.SMS_SENDER || 'Zziem', apiKey: env.ARKESEL_API_KEY, fetchImpl });
  } catch (err) {
    res = { ok: false, error: err.message };
  }
  store.outbox.push({ to, text, sent: res.ok, error: res.error, at: new Date().toISOString() });
  return res;
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    // Past the limit the rest is read and dropped (not kept in memory), then the request is refused.
    req.on('data', chunk => {
      size += chunk.length;
      if (size <= MAX_BODY_BYTES) chunks.push(chunk);
    });
    req.on('end', () => {
      if (size > MAX_BODY_BYTES) reject(Object.assign(new Error('request body too large'), { status: 413 }));
      else resolve(Buffer.concat(chunks).toString('utf8'));
    });
    req.on('error', reject);
  });
}

function createServer({
  storeFile, keys, facilityPhones = {}, nursePhones = {}, fallbackPhone = null,
  env = process.env, fetchImpl, now = () => new Date(),
}) {
  const authed = (req, role) => keyMatches(req.headers['x-api-key'], keys[role]);
  // Each facility has its own key, so one facility cannot confirm another's referrals.
  const facilityAuthed = (req, facilityId) => typeof facilityId === 'string' && !!keys.facility &&
    Object.prototype.hasOwnProperty.call(keys.facility, facilityId) &&
    keyMatches(req.headers['x-api-key'], keys.facility[facilityId]);

  // Every request runs after the previous one has finished, so read-change-write is never interleaved.
  let queue = Promise.resolve();
  const serialised = fn => {
    const run = queue.then(fn, fn);
    queue = run.catch(() => {});
    return run;
  };

  async function notifyFacility(store, r) {
    const phone = facilityPhones[r.facilityId];
    const res = phone
      ? await deliver(store, { to: phone, text: arrival.facilityMessage(r) }, env, fetchImpl)
      : { ok: false, error: 'no phone on file for this facility' };
    const updated = arrival.recordFacilityNotice(r, { delivered: res.ok, error: res.error, now: now() });
    store.referrals[r.id] = updated;
    return updated;
  }

  async function escalate(store, r) {
    const phone = nursePhones[r.nurseId] || fallbackPhone;
    const res = phone
      ? await deliver(store, { to: phone, text: arrival.nurseEscalationMessage(r) }, env, fetchImpl)
      : { ok: false, error: 'no phone on file for this nurse and no fallback phone' };
    const updated = arrival.recordEscalation(r, { delivered: res.ok, error: res.error, now: now() });
    store.referrals[r.id] = updated;
    return updated;
  }

  async function handle(req, body) {
    const store = loadStore(storeFile);

    if (req.method === 'POST' && req.url === '/referrals') {
      if (!authed(req, 'nurse')) return [401, { error: 'unauthorised' }];
      // Only these fields come from the caller; the code and the clock are always the server's own.
      const { id, urgency, facilityId, nurseId } = body;
      let r;
      try {
        r = arrival.createReferral({ id, urgency, facilityId, nurseId, now: now() });
      } catch (err) {
        return [400, { error: err.message }];
      }
      if (store.referrals[r.id]) return [409, { error: 'referral already exists' }];
      if (!facilityPhones[r.facilityId]) return [400, { error: 'unknown facility' }];
      store.referrals[r.id] = r;
      saveStore(storeFile, store); // keep the referral even if the process dies during the send
      const updated = await notifyFacility(store, r);
      saveStore(storeFile, store);
      if (!updated.facilityNotifiedAt) {
        // The referral exists and will be retried by /escalate; the nurse should know it is not through yet.
        return [502, { id: r.id, deadlineAt: r.deadlineAt, facilityNotified: false, error: updated.facilityNoticeError }];
      }
      return [201, { id: r.id, deadlineAt: r.deadlineAt, facilityNotified: true }];
    }

    if (req.method === 'POST' && req.url === '/confirm') {
      if (!facilityAuthed(req, body.facilityId)) return [401, { error: 'unauthorised' }];
      const t = now().getTime();
      const recent = (store.lookupFailures[body.facilityId] || []).filter(at => t - at < LOOKUP_WINDOW_MS);
      store.lookupFailures[body.facilityId] = recent;
      if (recent.length >= MAX_LOOKUP_FAILURES_PER_WINDOW) {
        saveStore(storeFile, store);
        return [429, { error: 'too many wrong codes; wait an hour or contact the district' }];
      }
      const code = arrival.normaliseCode(body.code);
      // Only this facility's referrals: a code issued to another facility looks exactly like a wrong one.
      const r = Object.values(store.referrals).find(x => x.facilityId === body.facilityId && x.code === code);
      if (!r) {
        recent.push(t);
        saveStore(storeFile, store);
        return [404, { error: 'no referral with that code' }];
      }
      const out = arrival.confirmArrival(r, { code, facilityId: body.facilityId, now: now() });
      store.referrals[r.id] = out.referral;
      saveStore(storeFile, store);
      return out.ok ? [200, { confirmed: true, id: r.id }] : [403, { error: out.error }];
    }

    if (req.method === 'POST' && req.url === '/escalate') {
      if (!authed(req, 'cron')) return [401, { error: 'unauthorised' }];
      const facilityPending = [];
      for (const r of arrival.dueForFacilityNotice(Object.values(store.referrals))) {
        const updated = await notifyFacility(store, r);
        saveStore(storeFile, store);
        if (!updated.facilityNotifiedAt) facilityPending.push({ id: r.id, error: updated.facilityNoticeError });
      }
      const escalated = [];
      const pending = [];
      for (const r of arrival.dueForEscalation(Object.values(store.referrals), now())) {
        const updated = await escalate(store, r);
        saveStore(storeFile, store);
        if (updated.escalatedAt) escalated.push(r.id);
        else pending.push({ id: r.id, attempts: updated.escalationAttempts, error: updated.escalationError });
      }
      const allDelivered = pending.length === 0 && facilityPending.length === 0;
      return [allDelivered ? 200 : 502, { escalated, pending, facilityPending }];
    }

    const m = req.method === 'GET' && req.url.match(/^\/referrals\/([^/]+)$/);
    if (m) {
      if (!authed(req, 'nurse')) return [401, { error: 'unauthorised' }];
      let id;
      try { id = decodeURIComponent(m[1]); } catch { return [400, { error: 'bad referral id' }]; }
      const r = Object.prototype.hasOwnProperty.call(store.referrals, id) ? store.referrals[id] : null;
      if (!r) return [404, { error: 'not found' }];
      const { code, ...publicFields } = r; // the code is only ever sent to the facility
      return [200, { ...publicFields, overdue: arrival.isOverdue(r, now()) }];
    }

    return [404, { error: 'no such route' }];
  }

  return http.createServer(async (req, res) => {
    const send = (status, payload) => {
      if (res.headersSent) return;
      res.writeHead(status, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(payload));
    };
    let raw;
    try {
      raw = await readBody(req);
    } catch (err) {
      return send(err.status || 400, { error: err.message });
    }
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { return send(400, { error: 'invalid JSON' }); }
    if (body === null || typeof body !== 'object' || Array.isArray(body)) return send(400, { error: 'body must be a JSON object' });

    try {
      const [status, payload] = await serialised(() => handle(req, body));
      return send(status, payload);
    } catch (err) {
      // Internal detail stays in the server log, not in the response.
      console.error(err);
      return send(500, { error: 'internal error' });
    }
  });
}

module.exports = { createServer, loadStore, keyMatches, MAX_LOOKUP_FAILURES_PER_WINDOW, LOOKUP_WINDOW_MS };

if (require.main === module) {
  const env = process.env;
  const keys = { nurse: env.NURSE_KEY, cron: env.CRON_KEY, facility: JSON.parse(env.FACILITY_KEYS || '{}') };
  if (!keys.nurse || !keys.cron || !Object.keys(keys.facility).length) {
    console.error('Set NURSE_KEY, CRON_KEY and FACILITY_KEYS (JSON: {facilityId: key}) before starting.');
    process.exit(1);
  }
  const server = createServer({
    storeFile: env.REFERRAL_STORE || path.join(__dirname, 'data', 'referrals.json'),
    keys,
    facilityPhones: JSON.parse(env.FACILITY_PHONES || '{}'),
    nursePhones: JSON.parse(env.NURSE_PHONES || '{}'),
    fallbackPhone: env.ESCALATION_FALLBACK_PHONE || null,
  });
  const port = Number(env.PORT || 4100);
  server.listen(port, () => console.log(`referral arrival server on :${port} (SMS ${sms.isLive(env) ? 'LIVE' : 'dry-run'})`));
}
