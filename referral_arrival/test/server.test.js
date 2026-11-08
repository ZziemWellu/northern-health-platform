const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createServer } = require('../server');

function start(overrides = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'ref-'));
  let t = new Date('2026-10-04T08:00:00Z');
  const server = createServer({
    storeFile: path.join(dir, 'store.json'),
    keys: { nurse: 'N', cron: 'C', facility: { F1: 'K1' } },
    facilityPhones: { F1: '0244000001' },
    nursePhones: { N1: '0244000002' },
    env: {},
    now: () => t,
    ...overrides,
  });
  return new Promise(resolve => server.listen(0, () => resolve({
    base: `http://127.0.0.1:${server.address().port}`,
    close: () => new Promise(r => server.close(r)),
    setNow: d => { t = d; },
    store: () => JSON.parse(fs.readFileSync(path.join(dir, 'store.json'), 'utf8')),
  })));
}

async function call(base, method, url, key, body) {
  const res = await fetch(base + url, {
    method,
    headers: { 'Content-Type': 'application/json', ...(key ? { 'x-api-key': key } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  return { status: res.status, body: await res.json() };
}

test('a nurse creates a referral; the facility gets a dry-run message with the code', async () => {
  const s = await start();
  try {
    const created = await call(s.base, 'POST', '/referrals', 'N', { id: 'r1', urgency: 'urgent', facilityId: 'F1', nurseId: 'N1' });
    assert.equal(created.status, 201);
    const outbox = s.store().outbox;
    assert.equal(outbox.length, 1);
    assert.equal(outbox[0].sent, false);
    assert.equal(outbox[0].to, '0244000001');
    assert.match(outbox[0].text, /referral [A-Z0-9]{6}/);
  } finally { await s.close(); }
});

test('the facility confirms with the code and its own key; the nurse view never shows the code', async () => {
  const s = await start();
  try {
    await call(s.base, 'POST', '/referrals', 'N', { id: 'r1', urgency: 'urgent', facilityId: 'F1', nurseId: 'N1' });
    const code = s.store().referrals.r1.code;
    const ok = await call(s.base, 'POST', '/confirm', 'K1', { code, facilityId: 'F1' });
    assert.equal(ok.status, 200);
    const status = await call(s.base, 'GET', '/referrals/r1', 'N');
    assert.notEqual(status.body.arrivedAt, null);
    assert.equal(status.body.code, undefined);
  } finally { await s.close(); }
});

test('a facility without its own key is refused', async () => {
  const s = await start();
  try {
    await call(s.base, 'POST', '/referrals', 'N', { id: 'r1', urgency: 'urgent', facilityId: 'F1', nurseId: 'N1' });
    const code = s.store().referrals.r1.code;
    const res = await call(s.base, 'POST', '/confirm', 'WRONG', { code, facilityId: 'F1' });
    assert.equal(res.status, 401);
  } finally { await s.close(); }
});

test('overdue referrals are escalated once by the cron job', async () => {
  const s = await start();
  try {
    await call(s.base, 'POST', '/referrals', 'N', { id: 'r1', urgency: 'emergency', facilityId: 'F1', nurseId: 'N1' });
    s.setNow(new Date('2026-10-07T08:00:00Z'));
    const first = await call(s.base, 'POST', '/escalate', 'C');
    assert.deepEqual(first.body.escalated, ['r1']);
    const second = await call(s.base, 'POST', '/escalate', 'C');
    assert.deepEqual(second.body.escalated, []);
    assert.ok(s.store().outbox.some(m => m.to === '0244000002' && /trace/.test(m.text)));
  } finally { await s.close(); }
});

test('repeated wrong codes from one facility are cut off', async () => {
  const s = await start();
  try {
    for (let i = 0; i < 20; i++) await call(s.base, 'POST', '/confirm', 'K1', { code: 'NOPE23', facilityId: 'F1' });
    const res = await call(s.base, 'POST', '/confirm', 'K1', { code: 'NOPE23', facilityId: 'F1' });
    assert.equal(res.status, 429);
  } finally { await s.close(); }
});

// --- Delivery is part of the safety loop -------------------------------------------------------

// A fake Arkesel gateway: `plan` decides, per call, whether the send succeeds.
function fakeGateway(plan) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    const { recipients, message } = JSON.parse(opts.body);
    calls.push({ to: recipients[0], text: message });
    const ok = plan(calls.length, recipients[0]);
    return {
      ok,
      status: ok ? 200 : 503,
      json: async () => (ok ? { status: 'success', data: { id: 'm' } } : { status: 'error', message: 'network down' }),
    };
  };
  return { fetchImpl, calls };
}
const LIVE = { SMS_LIVE: '1', ARKESEL_API_KEY: 'test-key' };

test('a failed escalation SMS stays pending, is reported with 502, and is retried until delivered', async () => {
  let failNurse = true;
  const gw = fakeGateway((n, to) => !(failNurse && to === '0244000002'));
  const s = await start({ env: LIVE, fetchImpl: gw.fetchImpl });
  try {
    await call(s.base, 'POST', '/referrals', 'N', { id: 'r1', urgency: 'emergency', facilityId: 'F1', nurseId: 'N1' });
    s.setNow(new Date('2026-10-07T08:00:00Z'));

    const first = await call(s.base, 'POST', '/escalate', 'C');
    assert.equal(first.status, 502);
    assert.deepEqual(first.body.escalated, []);
    assert.equal(first.body.pending[0].id, 'r1');
    assert.equal(s.store().referrals.r1.escalatedAt, null);
    assert.equal(s.store().referrals.r1.escalationAttempts, 1);
    assert.match(s.store().referrals.r1.escalationError, /network down/);

    const second = await call(s.base, 'POST', '/escalate', 'C');
    assert.equal(second.status, 502);
    assert.equal(s.store().referrals.r1.escalationAttempts, 2);

    failNurse = false;
    const third = await call(s.base, 'POST', '/escalate', 'C');
    assert.equal(third.status, 200);
    assert.deepEqual(third.body.escalated, ['r1']);
    assert.notEqual(s.store().referrals.r1.escalatedAt, null);

    const fourth = await call(s.base, 'POST', '/escalate', 'C');
    assert.deepEqual(fourth.body.escalated, []);
    assert.equal(gw.calls.filter(c => c.to === '0244000002').length, 3, 'no further texts once delivered');
  } finally { await s.close(); }
});

test('a gateway that throws (no network at all) is treated as not delivered', async () => {
  const s = await start({ env: LIVE, fetchImpl: async () => { throw new Error('ENOTFOUND'); } });
  try {
    const created = await call(s.base, 'POST', '/referrals', 'N', { id: 'r1', urgency: 'emergency', facilityId: 'F1', nurseId: 'N1' });
    assert.equal(created.status, 502);
    assert.equal(created.body.facilityNotified, false);
    assert.ok(s.store().referrals.r1, 'the referral is kept even though the notice failed');
  } finally { await s.close(); }
});

test('a nurse with no phone falls back to the district line; with no fallback the escalation stays pending', async () => {
  const withFallback = await start({ nursePhones: {}, fallbackPhone: '0244999999' });
  try {
    await call(withFallback.base, 'POST', '/referrals', 'N', { id: 'r1', urgency: 'emergency', facilityId: 'F1', nurseId: 'N1' });
    withFallback.setNow(new Date('2026-10-07T08:00:00Z'));
    const res = await call(withFallback.base, 'POST', '/escalate', 'C');
    assert.equal(res.status, 200);
    assert.ok(withFallback.store().outbox.some(m => m.to === '0244999999' && /trace/.test(m.text)));
  } finally { await withFallback.close(); }

  const noFallback = await start({ nursePhones: {} });
  try {
    await call(noFallback.base, 'POST', '/referrals', 'N', { id: 'r1', urgency: 'emergency', facilityId: 'F1', nurseId: 'N1' });
    noFallback.setNow(new Date('2026-10-07T08:00:00Z'));
    const res = await call(noFallback.base, 'POST', '/escalate', 'C');
    assert.equal(res.status, 502);
    assert.match(res.body.pending[0].error, /no phone/);
    assert.equal(noFallback.store().referrals.r1.escalatedAt, null);
  } finally { await noFallback.close(); }
});

test('a facility notice that failed is retried by the next cron run, so the facility can still confirm', async () => {
  let down = true;
  const gw = fakeGateway(() => !down);
  const s = await start({ env: LIVE, fetchImpl: gw.fetchImpl });
  try {
    const created = await call(s.base, 'POST', '/referrals', 'N', { id: 'r1', urgency: 'urgent', facilityId: 'F1', nurseId: 'N1' });
    assert.equal(created.status, 502);
    assert.equal(s.store().referrals.r1.facilityNotifiedAt, null);

    down = false;
    const run = await call(s.base, 'POST', '/escalate', 'C');
    assert.equal(run.status, 200);
    assert.notEqual(s.store().referrals.r1.facilityNotifiedAt, null);
    assert.equal(gw.calls.filter(c => c.to === '0244000001').length, 2);
  } finally { await s.close(); }
});

// --- Wrong codes, lookups and inputs -----------------------------------------------------------

test('the wrong-code limit is a rolling hour, not a lifetime count', async () => {
  const s = await start();
  try {
    for (let i = 0; i < 20; i++) await call(s.base, 'POST', '/confirm', 'K1', { code: 'NOPE23', facilityId: 'F1' });
    assert.equal((await call(s.base, 'POST', '/confirm', 'K1', { code: 'NOPE23', facilityId: 'F1' })).status, 429);

    s.setNow(new Date('2026-10-04T09:30:00Z'));
    await call(s.base, 'POST', '/referrals', 'N', { id: 'r1', urgency: 'urgent', facilityId: 'F1', nurseId: 'N1' });
    const code = s.store().referrals.r1.code;
    const ok = await call(s.base, 'POST', '/confirm', 'K1', { code, facilityId: 'F1' });
    assert.equal(ok.status, 200, 'an hour later the facility can confirm again');
  } finally { await s.close(); }
});

test('a facility cannot tell whether a code belongs to another facility', async () => {
  const s = await start({
    keys: { nurse: 'N', cron: 'C', facility: { F1: 'K1', F2: 'K2' } },
    facilityPhones: { F1: '0244000001', F2: '0244000003' },
  });
  try {
    await call(s.base, 'POST', '/referrals', 'N', { id: 'r1', urgency: 'urgent', facilityId: 'F1', nurseId: 'N1' });
    const code = s.store().referrals.r1.code;
    const other = await call(s.base, 'POST', '/confirm', 'K2', { code, facilityId: 'F2' });
    const unknown = await call(s.base, 'POST', '/confirm', 'K2', { code: 'ZZZZ22', facilityId: 'F2' });
    assert.equal(other.status, 404);
    assert.deepEqual(other.body, unknown.body);
    assert.equal(s.store().referrals.r1.arrivedAt, null);
  } finally { await s.close(); }
});

test('the caller cannot choose the code or the clock', async () => {
  const s = await start();
  try {
    await call(s.base, 'POST', '/referrals', 'N', {
      id: 'r1', urgency: 'urgent', facilityId: 'F1', nurseId: 'N1', code: 'AAAAAA', now: '2030-01-01T00:00:00Z',
    });
    const r = s.store().referrals.r1;
    assert.notEqual(r.code, 'AAAAAA');
    assert.equal(r.createdAt, '2026-10-04T08:00:00.000Z');
  } finally { await s.close(); }
});

test('bad input is refused with 400 or 413, not 500', async () => {
  const s = await start();
  try {
    assert.equal((await call(s.base, 'POST', '/referrals', 'N', { id: 'r1', urgency: 'soon', facilityId: 'F1', nurseId: 'N1' })).status, 400);
    assert.equal((await call(s.base, 'POST', '/referrals', 'N', { id: { $ne: 1 }, urgency: 'urgent', facilityId: 'F1', nurseId: 'N1' })).status, 400);
    assert.equal((await call(s.base, 'POST', '/referrals', 'N', { id: 'r2', urgency: 'urgent', facilityId: 'F9', nurseId: 'N1' })).status, 400);
    const arr = await fetch(s.base + '/referrals', { method: 'POST', headers: { 'x-api-key': 'N' }, body: '[1,2]' });
    assert.equal(arr.status, 400);
    const big = await fetch(s.base + '/referrals', { method: 'POST', headers: { 'x-api-key': 'N' }, body: 'x'.repeat(20000) });
    assert.equal(big.status, 413);
    const proto = await call(s.base, 'GET', '/referrals/__proto__', 'N');
    assert.equal(proto.status, 404);
  } finally { await s.close(); }
});

test('simultaneous requests never lose a referral, even while the gateway is slow', async () => {
  // A slow gateway leaves a gap between reading and writing the store, where a race would show.
  const slow = async () => {
    await new Promise(r => setTimeout(r, 5));
    return { ok: true, status: 200, json: async () => ({ status: 'success', data: { id: 'm' } }) };
  };
  const s = await start({ env: LIVE, fetchImpl: slow });
  try {
    const ids = Array.from({ length: 25 }, (_, i) => `r${i}`);
    const results = await Promise.all(ids.map(id =>
      call(s.base, 'POST', '/referrals', 'N', { id, urgency: 'routine', facilityId: 'F1', nurseId: 'N1' })));
    assert.ok(results.every(r => r.status === 201));
    assert.deepEqual(Object.keys(s.store().referrals).sort(), [...ids].sort());
    assert.equal(s.store().outbox.length, 25);
  } finally { await s.close(); }
});
