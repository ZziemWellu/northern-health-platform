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
    for (let i = 0; i < 50; i++) await call(s.base, 'POST', '/confirm', 'K1', { code: 'NOPE23', facilityId: 'F1' });
    const res = await call(s.base, 'POST', '/confirm', 'K1', { code: 'NOPE23', facilityId: 'F1' });
    assert.equal(res.status, 429);
  } finally { await s.close(); }
});
