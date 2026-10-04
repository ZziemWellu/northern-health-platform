// HTTP wrapper for the referral arrival loop. No framework: node:http, a JSON file store, and one key
// per kind of caller. SMS is dry-run unless SMS_LIVE=1 and ARKESEL_API_KEY are set (same rule as sms/).
//
// Routes
//   POST /referrals          CHPS nurse key   create a referral, sends the facility its code
//   POST /confirm            facility key     facility enters the code; no account needed
//   POST /escalate           cron key         marks overdue referrals and alerts the nurse
//   GET  /referrals/:id      nurse key        status of one referral (never the code)
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const arrival = require('./arrival');
const sms = require('../sms/gateway');

function loadStore(file) {
  if (!fs.existsSync(file)) return { referrals: {}, outbox: [] };
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

function saveStore(file, store) {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, JSON.stringify(store, null, 2));
}

// Dry-run logs every message to the outbox; live sends through the SMS gateway.
async function deliver(store, { to, text }, env, fetchImpl) {
  if (!sms.isLive(env)) {
    store.outbox.push({ to, text, sent: false, at: new Date().toISOString() });
    return { ok: true, dryRun: true };
  }
  const res = await sms.sendOne({ to, text, sender: env.SMS_SENDER || 'Zziem', apiKey: env.ARKESEL_API_KEY, fetchImpl });
  store.outbox.push({ to, text, sent: res.ok, error: res.error, at: new Date().toISOString() });
  return res;
}

function createServer({ storeFile, keys, facilityPhones = {}, nursePhones = {}, env = process.env, fetchImpl, now = () => new Date() }) {
  const authed = (req, role) => keys[role] && req.headers['x-api-key'] === keys[role];
  // Each facility has its own key, so one facility cannot confirm another's referrals.
  const facilityAuthed = (req, facilityId) => keys.facility && keys.facility[facilityId] &&
    req.headers['x-api-key'] === keys.facility[facilityId];
  const MAX_LOOKUP_FAILURES = 50;

  return http.createServer(async (req, res) => {
    const send = (code, body) => { res.writeHead(code, { 'Content-Type': 'application/json' }); res.end(JSON.stringify(body)); };
    let raw = '';
    for await (const chunk of req) raw += chunk;
    let body = {};
    try { body = raw ? JSON.parse(raw) : {}; } catch { return send(400, { error: 'invalid JSON' }); }

    const store = loadStore(storeFile);
    try {
      if (req.method === 'POST' && req.url === '/referrals') {
        if (!authed(req, 'nurse')) return send(401, { error: 'unauthorised' });
        const r = arrival.createReferral({ ...body, now: now() });
        if (store.referrals[r.id]) return send(409, { error: 'referral already exists' });
        store.referrals[r.id] = r;
        const facilityPhone = facilityPhones[r.facilityId];
        if (!facilityPhone) return send(400, { error: 'unknown facility' });
        await deliver(store, { to: facilityPhone, text: arrival.facilityMessage(r) }, env, fetchImpl);
        saveStore(storeFile, store);
        return send(201, { id: r.id, deadlineAt: r.deadlineAt });
      }

      if (req.method === 'POST' && req.url === '/confirm') {
        if (!facilityAuthed(req, body.facilityId)) return send(401, { error: 'unauthorised' });
        const failures = store.lookupFailures || (store.lookupFailures = {});
        if ((failures[body.facilityId] || 0) >= MAX_LOOKUP_FAILURES) return send(429, { error: 'too many wrong codes; contact the district' });
        const r = Object.values(store.referrals).find(x => x.code === String(body.code || '').trim().toUpperCase());
        if (!r) {
          failures[body.facilityId] = (failures[body.facilityId] || 0) + 1;
          saveStore(storeFile, store);
          return send(404, { error: 'no referral with that code' });
        }
        const out = arrival.confirmArrival(r, { code: body.code, facilityId: body.facilityId, now: now() });
        store.referrals[r.id] = out.referral;
        saveStore(storeFile, store);
        return out.ok ? send(200, { confirmed: true, id: r.id }) : send(403, { error: out.error });
      }

      if (req.method === 'POST' && req.url === '/escalate') {
        if (!authed(req, 'cron')) return send(401, { error: 'unauthorised' });
        const due = arrival.dueForEscalation(Object.values(store.referrals), now());
        for (const r of due) {
          const nursePhone = nursePhones[r.nurseId];
          if (nursePhone) await deliver(store, { to: nursePhone, text: arrival.nurseEscalationMessage(r) }, env, fetchImpl);
          store.referrals[r.id] = arrival.markEscalated(r, now());
        }
        saveStore(storeFile, store);
        return send(200, { escalated: due.map(r => r.id) });
      }

      const m = req.method === 'GET' && req.url.match(/^\/referrals\/([^/]+)$/);
      if (m) {
        if (!authed(req, 'nurse')) return send(401, { error: 'unauthorised' });
        const r = store.referrals[decodeURIComponent(m[1])];
        if (!r) return send(404, { error: 'not found' });
        const { code, ...publicFields } = r; // the code is only ever sent to the facility
        return send(200, { ...publicFields, overdue: arrival.isOverdue(r, now()) });
      }

      return send(404, { error: 'no such route' });
    } catch (err) {
      return send(500, { error: err.message });
    }
  });
}

module.exports = { createServer, loadStore };

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
  });
  const port = Number(env.PORT || 4100);
  server.listen(port, () => console.log(`referral arrival server on :${port} (SMS ${sms.isLive(env) ? 'LIVE' : 'dry-run'})`));
}
