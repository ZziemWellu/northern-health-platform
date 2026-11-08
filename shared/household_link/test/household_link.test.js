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

// --- Review fixes (7 November 2026) ---------------------------------------------------------------

function twoInOneHousehold() {
  const links = new HouseholdLinks();
  const a = links.register({ source: 'cht', externalId: 'c-a', householdId: 'H1' });
  const b = links.register({ source: 'cht', externalId: 'c-b', householdId: 'H1' });
  return { links, a, b };
}

test('a second record from the same source is refused, not silently overwritten', () => {
  const links = new HouseholdLinks();
  const p = links.register({ source: 'cht', externalId: 'c-1', householdId: 'H1' });
  assert.throws(() => links.register({ source: 'cht', externalId: 'c-2', householdId: 'H1', personId: p }), /already has a cht record/);
  assert.equal(links.lookup('cht', 'c-1'), p);
  assert.equal(links.lookup('cht', 'c-2'), null);
});

test('after a merge, the merged person still resolves to the survivor, and new links go to the survivor', () => {
  const { links, a, b } = twoInOneHousehold();
  const c = links.flagDuplicate(a, b, 'same name and age');
  links.mergeBySupervisor(c.id, 'Supervisor Abu');
  assert.equal(links.resolve(b), a);
  assert.equal(links.lookup('cht', 'c-b'), a);
  const viaMerged = links.register({ source: 'mama', externalId: 'P9', householdId: 'H1', personId: b });
  assert.equal(viaMerged, a, 'linking to a merged person attaches the reference to the survivor');
  assert.equal(links.state.people[a].refs.mama, 'P9');
});

test('a merge where both have a CHT record keeps both references', () => {
  const { links, a, b } = twoInOneHousehold();
  const c = links.flagDuplicate(a, b, 'same person registered twice');
  links.mergeBySupervisor(c.id, 'Supervisor Abu');
  assert.equal(links.state.people[a].refs.cht, 'c-a');
  assert.deepEqual(links.state.people[a].aliases, [{ source: 'cht', externalId: 'c-b' }]);
  assert.equal(links.lookup('cht', 'c-b'), a);
});

test('an old duplicate candidate cannot merge a person who was merged since', () => {
  const links = new HouseholdLinks();
  const a = links.register({ source: 'cht', externalId: 'c-a', householdId: 'H1' });
  const b = links.register({ source: 'cht', externalId: 'c-b', householdId: 'H1' });
  const d = links.register({ source: 'mama', externalId: 'P-d', householdId: 'H1' });
  const first = links.flagDuplicate(a, b, 'x');
  const stale = links.flagDuplicate(b, d, 'y');
  links.mergeBySupervisor(first.id, 'Supervisor Abu');
  assert.throws(() => links.mergeBySupervisor(stale.id, 'Supervisor Abu'), /already been merged/);
  assert.throws(() => links.flagDuplicate(b, d, 'again'), /already merged/);
});

test('duplicate flags need real people and are not queued twice', () => {
  const { links, a, b } = twoInOneHousehold();
  assert.throws(() => links.flagDuplicate(a, 'P-nobody', 'x'), /no person/);
  const first = links.flagDuplicate(a, b, 'x');
  assert.equal(links.flagDuplicate(b, a, 'x again'), first);
  assert.equal(links.pendingDuplicates().length, 1);
});

test('a phone number written with spaces or dashes is still refused in a flag', () => {
  for (const reason of ['call 024 412 3456', 'call 024-412-3456', 'call +233 24 412 3456', 'call (024) 4123456']) {
    assert.throws(() => riskFlagEvent({ personId: 'P1', source: 'cht', urgency: 'urgent', reason }), /phone number/, reason);
  }
  assert.doesNotThrow(() => riskFlagEvent({ personId: 'P1', source: 'cht', urgency: 'urgent', reason: 'BP 160/110 at 34 weeks' }));
});

test('inherited object keys are not people or references', () => {
  const links = new HouseholdLinks();
  assert.equal(links.lookup('cht', '__proto__'), null);
  assert.equal(links.resolve('constructor'), null);
});
