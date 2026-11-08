const { test } = require('node:test');
const assert = require('node:assert/strict');
const a = require('../arrival');

const NOW = new Date('2026-10-04T08:00:00Z');
const day = 24 * 60 * 60 * 1000;
const make = (over = {}) => a.createReferral({ id: 'r1', urgency: 'urgent', facilityId: 'F1', nurseId: 'N1', now: NOW, code: 'ABC234', ...over });

test('deadlines follow the clinical brief: emergency 1 day, urgent 2, routine 7', () => {
  assert.equal(Date.parse(make({ urgency: 'emergency' }).deadlineAt) - NOW.getTime(), 1 * day);
  assert.equal(Date.parse(make().deadlineAt) - NOW.getTime(), 2 * day);
  assert.equal(Date.parse(make({ urgency: 'routine' }).deadlineAt) - NOW.getTime(), 7 * day);
});

test('an unknown urgency or a missing party is refused', () => {
  assert.throws(() => make({ urgency: 'whenever' }));
  assert.throws(() => make({ facilityId: '' }));
});

test('the right code from the right facility confirms arrival', () => {
  const out = a.confirmArrival(make(), { code: 'abc234', facilityId: 'F1', now: NOW });
  assert.equal(out.ok, true);
  assert.equal(out.referral.arrivedAt, NOW.toISOString());
});

test('the wrong facility cannot confirm, even with the right code', () => {
  const out = a.confirmArrival(make(), { code: 'ABC234', facilityId: 'F2', now: NOW });
  assert.equal(out.ok, false);
});

test('wrong codes lock the referral after MAX_ATTEMPTS', () => {
  let r = make();
  for (let i = 0; i < a.MAX_ATTEMPTS; i++) r = a.confirmArrival(r, { code: 'WRONG1', facilityId: 'F1' }).referral;
  const out = a.confirmArrival(r, { code: 'ABC234', facilityId: 'F1' });
  assert.equal(out.ok, false);
  assert.match(out.error, /locked/);
});

test('confirming twice is harmless', () => {
  const first = a.confirmArrival(make(), { code: 'ABC234', facilityId: 'F1', now: NOW }).referral;
  const again = a.confirmArrival(first, { code: 'ABC234', facilityId: 'F1' });
  assert.equal(again.ok, true);
  assert.equal(again.note, 'already confirmed');
});

test('nothing escalates before its deadline, and escalates once after it', () => {
  const r = make();
  assert.deepEqual(a.dueForEscalation([r], new Date(NOW.getTime() + 1 * day)), []);
  const late = new Date(NOW.getTime() + 3 * day);
  const due = a.dueForEscalation([r], late);
  assert.equal(due.length, 1);
  const escalated = a.markEscalated(due[0], late);
  assert.deepEqual(a.dueForEscalation([escalated], late), []);
});

test('a confirmed referral never escalates', () => {
  const r = a.confirmArrival(make(), { code: 'ABC234', facilityId: 'F1', now: NOW }).referral;
  assert.deepEqual(a.dueForEscalation([r], new Date(NOW.getTime() + 30 * day)), []);
});

test('messages carry the code and deadline only, never a diagnosis or a name', () => {
  const text = a.facilityMessage(make()) + ' ' + a.nurseEscalationMessage(make());
  assert.match(text, /ABC234/);
  assert.doesNotMatch(text, /bleed|fit|eclampsia|malaria|name|patient|diagnos/i);
});

test('codes avoid look-alike characters', () => {
  for (let i = 0; i < 200; i++) assert.doesNotMatch(a.newCode(), /[01IO]/);
});

test('codes are unbiased: bytes past the last full multiple of the alphabet are discarded', () => {
  // 256 % 31 = 8, so bytes 248-255 would favour the first eight letters if they were kept.
  let calls = 0;
  const random = n => { calls++; return Buffer.from(calls === 1 ? Array(n).fill(250) : Array(n).fill(0)); };
  assert.equal(a.newCode(random), 'AAAAAA');
  assert.equal(calls, 2, 'the all-rejected batch was thrown away and a new one drawn');
});

test('ids must be short plain strings', () => {
  assert.throws(() => make({ id: { $ne: 1 } }), /id must be/);
  assert.throws(() => make({ id: 'x'.repeat(65) }), /id must be/);
  assert.throws(() => make({ nurseId: 'a b' }), /nurseId must be/);
});

test('a failed escalation keeps the referral due; only a delivered one stops it', () => {
  const late = new Date(NOW.getTime() + 3 * day);
  let r = a.recordEscalation(make(), { delivered: false, error: 'network down', now: late });
  assert.equal(r.escalatedAt, null);
  assert.equal(r.escalationAttempts, 1);
  assert.equal(r.escalationError, 'network down');
  assert.equal(a.dueForEscalation([r], late).length, 1);
  r = a.recordEscalation(r, { delivered: true, now: late });
  assert.equal(r.escalatedAt, late.toISOString());
  assert.equal(r.escalationAttempts, 2);
  assert.equal(r.escalationError, null);
  assert.deepEqual(a.dueForEscalation([r], late), []);
});

test('a facility notice is retried until delivered, and not at all once she has arrived', () => {
  const failed = a.recordFacilityNotice(make(), { delivered: false, error: 'HTTP 503', now: NOW });
  assert.equal(a.dueForFacilityNotice([failed]).length, 1);
  const sent = a.recordFacilityNotice(failed, { delivered: true, now: NOW });
  assert.deepEqual(a.dueForFacilityNotice([sent]), []);
  const arrived = a.confirmArrival(failed, { code: 'ABC234', facilityId: 'F1', now: NOW }).referral;
  assert.deepEqual(a.dueForFacilityNotice([arrived]), []);
});
