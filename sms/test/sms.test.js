const { test } = require('node:test');
const assert = require('node:assert/strict');
const { toGhanaInternational } = require('../phone');
const { render } = require('../templates');
const { planRun } = require('../plan');
const { sendOne, sendAll, isLive, ENDPOINT } = require('../gateway');
const { estimate } = require('../budget');

const reminder = (over = {}) => ({
  kind: 'anc_visit', patientId: 'P1', name: 'Ama', patientPhone: '0244123456',
  facility: 'Kumbungu Health Centre', dueDate: '2026-10-05', ...over,
});

test('converts a Ghana number to international form, and refuses anything else', () => {
  assert.equal(toGhanaInternational('0244123456'), '+233244123456');
  assert.equal(toGhanaInternational('024 412 3456'), '+233244123456');
  assert.equal(toGhanaInternational('12345'), null);
  assert.equal(toGhanaInternational(''), null);
  assert.equal(toGhanaInternational(undefined), null);
});

test('messages are non-clinical: they name a visit or a place, never a condition or dose', () => {
  const texts = ['anc_visit', 'birth_plan', 'referral'].map(k =>
    render(k, { name: 'Ama', facility: 'Kumbungu Health Centre', date: '2026-10-05' }));
  for (const t of texts) {
    assert.doesNotMatch(t, /pre-?eclampsia|bleed|fever|malaria|dose|tablet|blood pressure|danger/i);
    assert.match(t, /Reply STOP|CHW|clinic|facility|Kumbungu/);
  }
});

test('a template with a missing value fails loudly rather than sending "undefined"', () => {
  assert.throws(() => render('anc_visit', { name: 'Ama' }), /Missing "facility"/);
});

test('sends a due reminder once, and never again for the same reminder', () => {
  const r = reminder();
  const first = planRun({ reminders: [r], today: '2026-10-05', maxMessages: 10 });
  assert.equal(first.send.length, 1);
  assert.equal(first.send[0].to, '+233244123456');
  const again = planRun({ reminders: [r], sentKeys: new Set([first.send[0].key]), today: '2026-10-05', maxMessages: 10 });
  assert.equal(again.send.length, 0);
  assert.equal(again.skipped[0].reason, 'already sent');
});

test('does not send before the due date', () => {
  const p = planRun({ reminders: [reminder({ dueDate: '2026-10-09' })], today: '2026-10-05', maxMessages: 10 });
  assert.equal(p.send.length, 0);
  assert.equal(p.skipped[0].reason, 'not due yet');
});

test('never texts someone who replied STOP', () => {
  const p = planRun({ reminders: [reminder()], optedOut: new Set(['0244123456']), today: '2026-10-05', maxMessages: 10 });
  assert.equal(p.send.length, 0);
  assert.equal(p.skipped[0].reason, 'opted out');
});

test('reports a bad phone number instead of sending it anywhere', () => {
  const p = planRun({ reminders: [reminder({ patientPhone: '0244' })], today: '2026-10-05', maxMessages: 10 });
  assert.equal(p.send.length, 0);
  assert.equal(p.skipped[0].reason, 'invalid phone number');
});

test('stops at the run cap, so a bug cannot spend the whole budget', () => {
  const many = [1, 2, 3, 4, 5].map(i => reminder({ patientId: 'P' + i, patientPhone: '024412345' + i }));
  const p = planRun({ reminders: many, today: '2026-10-05', maxMessages: 2 });
  assert.equal(p.send.length, 2);
  assert.equal(p.skipped.filter(s => s.reason === 'run cap reached').length, 3);
});

test('live only when both the switch and the key are set', () => {
  assert.equal(isLive({ SMS_LIVE: '1' }), false);
  assert.equal(isLive({ ARKESEL_API_KEY: 'k' }), false);
  assert.equal(isLive({ SMS_LIVE: '1', ARKESEL_API_KEY: 'k' }), true);
});

test('sends to the documented endpoint with the api-key header and the documented body', async () => {
  let seen;
  const fakeFetch = async (url, init) => {
    seen = { url, init, body: JSON.parse(init.body) };
    return { ok: true, status: 200, json: async () => ({ status: 'success', data: { id: 'm1' } }) };
  };
  const res = await sendOne({ to: '+233244123456', text: 'Hi', sender: 'Zziem', apiKey: 'secret', fetchImpl: fakeFetch });
  assert.equal(res.ok, true);
  assert.equal(seen.url, ENDPOINT);
  assert.equal(seen.init.method, 'POST');
  assert.equal(seen.init.headers['api-key'], 'secret');
  assert.deepEqual(seen.body, { sender: 'Zziem', message: 'Hi', recipients: ['+233244123456'] });
});

test('a gateway error on one message is recorded and does not stop the rest', async () => {
  const fakeFetch = async (url, init) => {
    const to = JSON.parse(init.body).recipients[0];
    if (to === '+233244000001') throw new Error('network down');
    return { ok: true, status: 200, json: async () => ({ status: 'success', data: { id: 'x' } }) };
  };
  const results = await sendAll(
    [{ key: 'a', to: '+233244000001', text: 'a' }, { key: 'b', to: '+233244000002', text: 'b' }],
    { sender: 'Zziem', apiKey: 'k', fetchImpl: fakeFetch });
  assert.equal(results[0].ok, false);
  assert.equal(results[1].ok, true);
});

test('budget: messages times the rate range, in cedis', () => {
  const e = estimate({ women: 500, messagesPerWoman: 6 });
  assert.equal(e.messages, 3000);
  assert.equal(e.cedis.typical, 90);
  assert.equal(e.cedis.high, 240);
});
