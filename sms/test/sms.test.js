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

test('every template tells the reader how to stop the messages', () => {
  const { TEMPLATES, OPT_OUT } = require('../templates');
  for (const [kind, langs] of Object.entries(TEMPLATES)) {
    for (const text of Object.values(langs)) assert.ok(text.endsWith(OPT_OUT), `${kind} has no opt-out line`);
  }
});

test('a STOP reply in international form still stops a number recorded locally, and the reverse', () => {
  for (const stop of ['233244123456', '+233244123456', '+233 24 412 3456', '0244123456', '244123456']) {
    const p = planRun({ reminders: [reminder()], optedOut: new Set([stop]), today: '2026-10-05', maxMessages: 10 });
    assert.equal(p.send.length, 0, `STOP from ${stop} was ignored`);
  }
  const p = planRun({ reminders: [reminder({ patientPhone: '024 412 3456' })], optedOut: new Set(['233244123456']), today: '2026-10-05', maxMessages: 10 });
  assert.equal(p.send.length, 0);
});

test('the same reminder listed twice in one input is sent once', () => {
  const p = planRun({ reminders: [reminder(), reminder()], today: '2026-10-05', maxMessages: 10 });
  assert.equal(p.send.length, 1);
  assert.equal(p.skipped[0].reason, 'duplicate in this run');
});

// --- run.js: the send log is the memory against double texts -----------------------------------

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { main } = require('../run');

function runFixture(reminders) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sms-'));
  const input = path.join(dir, 'reminders.json');
  const logPath = path.join(dir, 'sms-log.json');
  fs.writeFileSync(input, JSON.stringify(reminders));
  return { dir, logPath, argv: ['node', 'run.js', '--input', input, '--log', logPath] };
}
const LIVE_ENV = { SMS_LIVE: '1', ARKESEL_API_KEY: 'k' };
const quiet = () => {};
const today = () => new Date('2026-10-05T09:00:00Z');
const three = [1, 2, 3].map(i => reminder({ patientId: 'P' + i, patientPhone: '024412345' + i }));

test('a run that dies halfway has logged what it sent, so the next run does not send it again', async () => {
  const f = runFixture(three);
  const sentTo = [];
  const dying = async (url, init) => {
    const to = JSON.parse(init.body).recipients[0];
    if (sentTo.length === 2) throw Object.assign(new Error('process killed'), { fatal: true });
    sentTo.push(to);
    return { ok: true, status: 200, json: async () => ({ status: 'success', data: { id: to } }) };
  };
  // The third send "kills" the run: sendAll records it as a failure, which is what a crash leaves behind.
  await main({ argv: f.argv, env: LIVE_ENV, fetchImpl: dying, log: quiet, now: today });
  const log = JSON.parse(fs.readFileSync(f.logPath, 'utf8'));
  assert.equal(log.filter(e => e.ok).length, 2);

  const second = [];
  const healthy = async (url, init) => {
    second.push(JSON.parse(init.body).recipients[0]);
    return { ok: true, status: 200, json: async () => ({ status: 'success', data: { id: 'x' } }) };
  };
  await main({ argv: f.argv, env: LIVE_ENV, fetchImpl: healthy, log: quiet, now: today });
  assert.deepEqual(second, ['+233244123453'], 'only the message that never went out is sent');
});

test('the log is written after each message, before the next one is sent', async () => {
  const f = runFixture(three);
  const logSizesSeen = [];
  const fetchImpl = async () => {
    logSizesSeen.push(fs.existsSync(f.logPath) ? JSON.parse(fs.readFileSync(f.logPath, 'utf8')).length : 0);
    return { ok: true, status: 200, json: async () => ({ status: 'success', data: { id: 'x' } }) };
  };
  await main({ argv: f.argv, env: LIVE_ENV, fetchImpl, log: quiet, now: today });
  assert.deepEqual(logSizesSeen, [0, 1, 2]);
});

test('a second live run is refused while the first holds the lock', async () => {
  const f = runFixture(three);
  fs.writeFileSync(`${f.logPath}.lock`, '{}');
  await assert.rejects(
    main({ argv: f.argv, env: LIVE_ENV, fetchImpl: async () => assert.fail('must not send'), log: quiet, now: today }),
    /Another run holds/);
  fs.rmSync(`${f.logPath}.lock`);
  const ok = await main({ argv: f.argv, env: LIVE_ENV, fetchImpl: async () => ({ ok: true, status: 200, json: async () => ({ status: 'success', data: {} }) }), log: quiet, now: today });
  assert.equal(ok.sent, 3);
  assert.equal(fs.existsSync(`${f.logPath}.lock`), false, 'the lock is released after the run');
});

test('a dry run sends nothing and writes no log', async () => {
  const f = runFixture(three);
  const res = await main({ argv: f.argv, env: {}, fetchImpl: async () => assert.fail('must not send'), log: quiet, now: today });
  assert.equal(res.dryRun, true);
  assert.equal(res.planned, 3);
  assert.equal(fs.existsSync(f.logPath), false);
});

test('budget: messages times the rate range, in cedis', () => {
  const e = estimate({ women: 500, messagesPerWoman: 6 });
  assert.equal(e.messages, 3000);
  assert.equal(e.cedis.typical, 90);
  assert.equal(e.cedis.high, 240);
});

test('budget: local-language reminders are billed per SMS part', () => {
  const e = estimate({ women: 500, messagesPerWoman: 6, partsPerMessage: 3 });
  assert.deepEqual([e.messages, e.parts, e.cedis.typical], [3000, 9000, 270]);
});

test('each message records its language; with no checked translation a Dagbani speaker gets English, flagged', () => {
  const p = planRun({
    reminders: [reminder({ preferred_language: 'dag', other_languages: 'hau' }), reminder({ patientId: 'p2', preferred_language: 'en' })],
    today: '2026-10-05', maxMessages: 10,
  });
  assert.deepEqual(p.send.map(m => [m.lang, m.fallback]), [['en', true], ['en', false]]);
  assert.match(p.send[0].text, /Reply STOP/);
});

test('a checked Dagbani reminder goes to a Dagbani speaker, with the gateway keyword kept', () => {
  const os = require('node:os');
  const path = require('node:path');
  const languages = require('../../shared/languages');
  const { TEMPLATES } = require('../templates');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nhp-sms-'));
  fs.writeFileSync(path.join(dir, 'dag.json'), JSON.stringify({ language: 'dag', entries: { 'sms.anc_visit': {
    text: 'DAG {name} {facility} {date}. STOP', source: TEMPLATES.anc_visit.en, status: 'checked',
    translator: 'A', checker: 'B', back_translation: 'x', date: '2026-11-08' } } }));
  process.env.NHP_TRANSLATIONS_DIR = dir;
  languages.clearCache();
  try {
    const p = planRun({ reminders: [reminder({ preferred_language: 'Dagbanli' })], today: '2026-10-05', maxMessages: 10 });
    assert.equal(p.send[0].lang, 'dag');
    assert.match(p.send[0].text, /^DAG .* STOP$/);
    assert.throws(() => render('birth_plan', { name: 'a', facility: 'b' }, 'dag'), /No usable dag template/);
  } finally {
    delete process.env.NHP_TRANSLATIONS_DIR;
    languages.clearCache();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
