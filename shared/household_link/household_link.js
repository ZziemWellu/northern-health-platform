// Shared household record: one platform ID per person, linked by reference to the CHT contact and to
// the MAMA-AI patient. The link stores references only: no names, phone numbers or clinical detail
// (blueprint principle 8: collect the minimum). Duplicates are flagged for a supervisor and never
// merged automatically (blueprint, Identity). A risk flag from Module 1 becomes a referral request
// for Module 2 without re-entry (blueprint, Standalone vs full-system deployment).
const crypto = require('node:crypto');

const SOURCES = ['cht', 'mama'];
const URGENCIES = ['emergency', 'urgent', 'routine'];
// Phone-number-like text (Ghana 0XXXXXXXXX or +233…) must never travel in an event. Spaces, dots and
// dashes are removed before the check, so "024 412 3456" is caught too.
const PHONE_LIKE = /(\+?233|0)\d{9}/;
const looksLikePhone = text => PHONE_LIKE.test(String(text).replace(/[\s.\-()]/g, ''));

const own = (obj, key) => Object.prototype.hasOwnProperty.call(obj, key);

class HouseholdLinks {
  constructor(state = { people: {}, refs: {}, candidates: [], audit: [] }) {
    this.state = state;
  }

  // Follows merges to the surviving person, so a reference to a merged record still finds her.
  resolve(personId) {
    let id = personId;
    const seen = new Set();
    while (id && own(this.state.people, id) && this.state.people[id].merged) {
      if (seen.has(id)) throw new Error('merge chain loops; the record needs repair');
      seen.add(id);
      id = this.state.people[id].mergedInto;
    }
    return id && own(this.state.people, id) ? id : null;
  }

  // Idempotent: the same source and external ID always returns the same platform person.
  register({ source, externalId, householdId, personId, now = new Date(), random = crypto.randomBytes }) {
    if (!SOURCES.includes(source)) throw new Error(`source must be one of ${SOURCES.join(', ')}`);
    if (!externalId || !householdId) throw new Error('a link needs an external ID and a household ID');
    const key = `${source}:${externalId}`;
    if (own(this.state.refs, key)) return this.resolve(this.state.refs[key]);

    // Linking to someone already merged would attach the reference to a dead record.
    const id = personId ? (this.resolve(personId) || personId) : `P-${random(8).toString('hex')}`;
    if (!own(this.state.people, id)) {
      this.state.people[id] = { householdId, refs: {}, merged: false };
    }
    const person = this.state.people[id];
    if (person.householdId !== householdId) {
      throw new Error('this person is already linked to a different household');
    }
    // A second, different record from the same source is a possible duplicate, not a silent overwrite.
    if (own(person.refs, source) && person.refs[source] !== externalId) {
      throw new Error(`this person already has a ${source} record (${person.refs[source]}); flag a duplicate instead`);
    }
    person.refs[source] = externalId;
    this.state.refs[key] = id;
    return id;
  }

  lookup(source, externalId) {
    const key = `${source}:${externalId}`;
    return own(this.state.refs, key) ? this.resolve(this.state.refs[key]) : null;
  }

  // Two records that look like the same person are queued for a supervisor. Nothing is merged here.
  flagDuplicate(personA, personB, reason) {
    if (personA === personB) return null;
    for (const p of [personA, personB]) {
      if (!own(this.state.people, p)) throw new Error(`no person ${p}`);
      if (this.state.people[p].merged) throw new Error(`${p} is already merged into ${this.state.people[p].mergedInto}`);
    }
    const already = this.state.candidates.find(c => c.status === 'pending' &&
      ((c.personA === personA && c.personB === personB) || (c.personA === personB && c.personB === personA)));
    if (already) return already;
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
    // The queue can be old: if either was merged since, this candidate no longer describes two live records.
    if (keep.merged || drop.merged) throw new Error('one of these people has already been merged; flag the duplicate again');
    if (keep.householdId !== drop.householdId) throw new Error('duplicates in different households are not merged');

    for (const [source, externalId] of Object.entries(drop.refs)) {
      // Both had a record in the same source: keep both references (the other as an alias) so neither
      // the CHT contact nor the MAMA-AI patient is lost. Merge them in the source system too.
      if (own(keep.refs, source) && keep.refs[source] !== externalId) {
        keep.aliases = [...(keep.aliases || []), { source, externalId }];
      } else {
        keep.refs[source] = externalId;
      }
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
  if (looksLikePhone(text)) throw new Error('a phone number must not travel in a flag');
  return { type: 'risk_flag', personId, source, urgency, reason: text, at: at.toISOString() };
}

// Turns a flag into the input the referral module already accepts (arrival.createReferral).
function referralFromFlag(flag, { facilityId, nurseId, referralId }) {
  if (flag.type !== 'risk_flag') throw new Error('not a risk flag');
  return { id: referralId, urgency: flag.urgency, facilityId, nurseId, personId: flag.personId };
}

module.exports = { SOURCES, URGENCIES, HouseholdLinks, riskFlagEvent, referralFromFlag };
