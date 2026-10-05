// Shared household record: one platform ID per person, linked by reference to the CHT contact and to
// the MAMA-AI patient. The link stores references only: no names, phone numbers or clinical detail
// (blueprint principle 8: collect the minimum). Duplicates are flagged for a supervisor and never
// merged automatically (blueprint, Identity). A risk flag from Module 1 becomes a referral request
// for Module 2 without re-entry (blueprint, Standalone vs full-system deployment).
const crypto = require('node:crypto');

const SOURCES = ['cht', 'mama'];
const URGENCIES = ['emergency', 'urgent', 'routine'];
// Phone-number-like text (Ghana 0XXXXXXXXX or +233…) must never travel in an event.
const PHONE_LIKE = /(\+?233|0)\d{9}/;

class HouseholdLinks {
  constructor(state = { people: {}, refs: {}, candidates: [], audit: [] }) {
    this.state = state;
  }

  // Idempotent: the same source and external ID always returns the same platform person.
  register({ source, externalId, householdId, personId, now = new Date(), random = crypto.randomBytes }) {
    if (!SOURCES.includes(source)) throw new Error(`source must be one of ${SOURCES.join(', ')}`);
    if (!externalId || !householdId) throw new Error('a link needs an external ID and a household ID');
    const key = `${source}:${externalId}`;
    if (this.state.refs[key]) return this.state.refs[key];

    const id = personId || `P-${random(8).toString('hex')}`;
    if (!this.state.people[id]) {
      this.state.people[id] = { householdId, refs: {}, merged: false };
    }
    const person = this.state.people[id];
    if (person.householdId !== householdId) {
      throw new Error('this person is already linked to a different household');
    }
    person.refs[source] = externalId;
    this.state.refs[key] = id;
    return id;
  }

  lookup(source, externalId) {
    return this.state.refs[`${source}:${externalId}`] || null;
  }

  // Two records that look like the same person are queued for a supervisor. Nothing is merged here.
  flagDuplicate(personA, personB, reason) {
    if (personA === personB) return null;
    const candidate = { id: this.state.candidates.length, personA, personB, reason, status: 'pending' };
    this.state.candidates.push(candidate);
    return candidate;
  }

  pendingDuplicates() {
    return this.state.candidates.filter(c => c.status === 'pending');
  }

  // Only a named supervisor can merge. References move to the surviving person and the other is marked merged.
  mergeBySupervisor(candidateId, supervisor, now = new Date()) {
    if (!supervisor || !String(supervisor).trim()) throw new Error('a merge needs the supervisor who approved it');
    const c = this.state.candidates[candidateId];
    if (!c || c.status !== 'pending') throw new Error('no pending duplicate with that ID');
    const keep = this.state.people[c.personA];
    const drop = this.state.people[c.personB];
    if (!keep || !drop) throw new Error('both people must exist');
    if (keep.householdId !== drop.householdId) throw new Error('duplicates in different households are not merged');

    for (const [source, externalId] of Object.entries(drop.refs)) {
      keep.refs[source] = externalId;
      this.state.refs[`${source}:${externalId}`] = c.personA;
    }
    drop.merged = true;
    drop.mergedInto = c.personA;
    drop.refs = {};
    c.status = 'merged';
    this.state.audit.push({ action: 'merge', from: c.personB, into: c.personA, by: String(supervisor).trim(), at: now.toISOString() });
    return c.personA;
  }
}

// A Module 1 risk flag, as shared with Module 2. Only references, a level and a short reason.
function riskFlagEvent({ personId, source, urgency, reason, at = new Date() }) {
  if (!personId) throw new Error('a flag needs a person');
  if (!SOURCES.includes(source)) throw new Error(`source must be one of ${SOURCES.join(', ')}`);
  if (!URGENCIES.includes(urgency)) throw new Error(`urgency must be one of ${URGENCIES.join(', ')}`);
  const text = String(reason || '');
  if (text.length > 200) throw new Error('reason is too long; keep it to one short sentence');
  if (PHONE_LIKE.test(text)) throw new Error('a phone number must not travel in a flag');
  return { type: 'risk_flag', personId, source, urgency, reason: text, at: at.toISOString() };
}

// Turns a flag into the input the referral module already accepts (arrival.createReferral).
function referralFromFlag(flag, { facilityId, nurseId, referralId }) {
  if (flag.type !== 'risk_flag') throw new Error('not a risk flag');
  return { id: referralId, urgency: flag.urgency, facilityId, nurseId, personId: flag.personId };
}

module.exports = { SOURCES, URGENCIES, HouseholdLinks, riskFlagEvent, referralFromFlag };
