// Referral arrival loop (Module 2). A referral stays open until the receiving facility confirms the
// woman arrived with a short code, and it escalates to the CHPS nurse if the deadline passes.
//
// Pure functions: no network, no storage. server.js wraps them. Messages carry a reference code only,
// never a diagnosis, name or clinical detail (blueprint, Module 2 risks).
//
// Deadlines come from CLINICAL_REVIEW_BRIEF.md (emergency 1 day, urgent 2, routine 7). The blueprint
// suggests hours for an emergency; that is a clinical decision for the reviewer, so it is one constant.
const crypto = require('node:crypto');

const DEADLINE_DAYS = { emergency: 1, urgent: 2, routine: 7 };
const MAX_ATTEMPTS = 5;
// No look-alike characters (0/O, 1/I), so a code read over the phone is not mistyped.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';

function newCode(random = crypto.randomBytes) {
  const bytes = random(6);
  return Array.from(bytes, b => CODE_ALPHABET[b % CODE_ALPHABET.length]).join('');
}

function createReferral({ id, urgency, facilityId, nurseId, now = new Date(), code = newCode() }) {
  if (!DEADLINE_DAYS[urgency]) throw new Error(`urgency must be one of ${Object.keys(DEADLINE_DAYS).join(', ')}`);
  if (!id || !facilityId || !nurseId) throw new Error('a referral needs an id, a facility and a nurse');
  const deadline = new Date(now.getTime() + DEADLINE_DAYS[urgency] * 24 * 60 * 60 * 1000);
  return {
    id, code, urgency, facilityId, nurseId,
    createdAt: now.toISOString(),
    deadlineAt: deadline.toISOString(),
    arrivedAt: null,
    failedAttempts: 0,
    escalatedAt: null,
  };
}

// The facility enters the code. Wrong codes count against the referral; after MAX_ATTEMPTS it locks,
// so a code cannot be guessed by trying many times.
function confirmArrival(referral, { code, facilityId, now = new Date() }) {
  if (referral.arrivedAt) return { ok: true, referral, note: 'already confirmed' };
  if (referral.failedAttempts >= MAX_ATTEMPTS) return { ok: false, referral, error: 'locked after too many wrong codes' };
  if (facilityId !== referral.facilityId) return { ok: false, referral, error: 'not this facility' };
  if (String(code || '').trim().toUpperCase() !== referral.code) {
    return { ok: false, referral: { ...referral, failedAttempts: referral.failedAttempts + 1 }, error: 'wrong code' };
  }
  return { ok: true, referral: { ...referral, arrivedAt: now.toISOString() } };
}

function isOverdue(referral, now = new Date()) {
  return !referral.arrivedAt && now.getTime() > Date.parse(referral.deadlineAt);
}

// Returns referrals that have just become overdue and have not yet been escalated.
function dueForEscalation(referrals, now = new Date()) {
  return referrals.filter(r => isOverdue(r, now) && !r.escalatedAt);
}

function markEscalated(referral, now = new Date()) {
  return { ...referral, escalatedAt: now.toISOString() };
}

// Messages. The facility gets the code and the deadline; the nurse gets the reference and the
// facility. Neither mentions a diagnosis or the woman's name.
function facilityMessage(referral, shortcode = 'ZZ REF') {
  const due = referral.deadlineAt.slice(0, 10);
  return `${shortcode}: referral ${referral.code}. Please confirm arrival with this code by ${due}.`;
}

function nurseEscalationMessage(referral) {
  return `Referral ${referral.code} is not confirmed as arrived after its deadline. Please trace the woman.`;
}

module.exports = {
  DEADLINE_DAYS, MAX_ATTEMPTS, CODE_ALPHABET,
  newCode, createReferral, confirmArrival, isOverdue, dueForEscalation, markEscalated,
  facilityMessage, nurseEscalationMessage,
};
