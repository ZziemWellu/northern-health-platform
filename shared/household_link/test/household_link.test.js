const { test } = require('node:test');
const assert = require('node:assert/strict');
const { HouseholdLinks, riskFlagEvent, referralFromFlag } = require('../household_link');

const fixedRandom = (n) => Buffer.alloc(n, 0xab);

test('the same CHT contact always maps to the same platform person (idempotent)', () => {
  const links = new HouseholdLinks();
  const a = links.register({ source: 'cht', externalId: 'contact-1', householdId: 'H1', random: fixedRandom });
  const b = links.register({ source: 'cht', externalId: 'contact-1', householdId: 'H1', random: fixedRandom });
  assert.equal(a, b);
  assert.equal(Object.keys(links.state.people).length, 1);
});

test('a CHT contact and a MAMA-AI patient can be linked to the same person', () => {
  const links = new HouseholdLinks();
  const p = links.register({ source: 'cht', externalId: 'contact-1', householdId: 'H1', random: fixedRandom });
  const q = links.register({ source: 'mama', externalId: 'P004', householdId: 'H1', personId: p });
  assert.equal(q, p);
  assert.equal(links.lookup('mama', 'P004'), p);
  assert.deepEqual(links.state.people[p].refs, { cht: 'contact-1', mama: 'P004' });
});

test('an unknown source is refused', () => {
  assert.throws(() => new HouseholdLinks().register({ source: 'husband', externalId: 'x', householdId: 'H1' }));
});

test('a person cannot be attached to a different household', () => {
  const links = new HouseholdLinks();
  const p = links.register({ source: 'cht', externalId: 'c1', householdId: 'H1', random: fixedRandom });
  assert.throws(() => links.register({ source: 'mama', externalId: 'P9', householdId: 'H2', personId: p }));
});

test('duplicates are queued for a supervisor and never merged automatically', () => {
  const links = new HouseholdLinks();
  const a = links.register({ source: 'cht', externalId: 'c1', householdId: 'H1', random: () => Buffer.alloc(8, 1) });
  const b = links.register({ source: 'cht', externalId: 'c2', householdId: 'H1', random: () => Buffer.alloc(8, 2) });
  links.flagDuplicate(a, b, 'same name and date of birth');
  assert.equal(links.pendingDuplicates().length, 1);
  assert.equal(links.state.people[b].merged, false);
  assert.equal(links.lookup('cht', 'c2'), b);
});

test('a supervisor merge moves references to the surviving person and writes an audit line', () => {
  const links = new HouseholdLinks();
  const a = links.register({ source: 'cht', externalId: 'c1', householdId: 'H1', random: () => Buffer.alloc(8, 1) });
  const b = links.register({ source: 'mama', externalId: 'P77', householdId: 'H1', random: () => Buffer.alloc(8, 2) });
  const cand = links.flagDuplicate(a, b, 'same person?');
  links.mergeBySupervisor(cand.id, 'Supervisor Mensah');
  assert.equal(links.lookup('mama', 'P77'), a);
  assert.equal(links.state.people[b].merged, true);
  assert.equal(links.state.audit[0].by, 'Supervisor Mensah');
});

test('a merge without a named supervisor is refused', () => {
  const links = new HouseholdLinks();
  const a = links.register({ source: 'cht', externalId: 'c1', householdId: 'H1', random: () => Buffer.alloc(8, 1) });
  const b = links.register({ source: 'cht', externalId: 'c2', householdId: 'H1', random: () => Buffer.alloc(8, 2) });
  const cand = links.flagDuplicate(a, b, 'x');
  assert.throws(() => links.mergeBySupervisor(cand.id, '  '));
});

test('people in different households are never merged', () => {
  const links = new HouseholdLinks();
  const a = links.register({ source: 'cht', externalId: 'c1', householdId: 'H1', random: () => Buffer.alloc(8, 1) });
  const b = links.register({ source: 'cht', externalId: 'c2', householdId: 'H2', random: () => Buffer.alloc(8, 2) });
  const cand = links.flagDuplicate(a, b, 'x');
  assert.throws(() => links.mergeBySupervisor(cand.id, 'Supervisor'), /different households/);
});

test('a risk flag carries references and a short reason only', () => {
  const flag = riskFlagEvent({ personId: 'P-1', source: 'cht', urgency: 'emergency', reason: 'Newborn not feeding', at: new Date(0) });
  assert.deepEqual(Object.keys(flag).sort(), ['at', 'personId', 'reason', 'source', 'type', 'urgency']);
});

test('a phone number cannot be sent in a flag', () => {
  assert.throws(() => riskFlagEvent({ personId: 'P-1', source: 'cht', urgency: 'urgent', reason: 'call 0244123456' }), /phone/);
  assert.throws(() => riskFlagEvent({ personId: 'P-1', source: 'cht', urgency: 'urgent', reason: '+233244123456' }), /phone/);
});

test('an unknown urgency or an overlong reason is refused', () => {
  assert.throws(() => riskFlagEvent({ personId: 'P-1', source: 'cht', urgency: 'maybe', reason: 'x' }));
  assert.throws(() => riskFlagEvent({ personId: 'P-1', source: 'cht', urgency: 'routine', reason: 'x'.repeat(201) }));
});

test('a flag becomes the referral input the arrival module already accepts', () => {
  const flag = riskFlagEvent({ personId: 'P-1', source: 'cht', urgency: 'urgent', reason: 'x' });
  const ref = referralFromFlag(flag, { facilityId: 'F1', nurseId: 'N1', referralId: 'r-9' });
  assert.deepEqual(ref, { id: 'r-9', urgency: 'urgent', facilityId: 'F1', nurseId: 'N1', personId: 'P-1' });
});
