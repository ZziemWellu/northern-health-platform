// Referral arrival loop (Module 2). A referral stays open until the receiving facility confirms the
// woman arrived with a short code, and it escalates to the CHPS nurse if the deadline passes.
//
// Pure functions: no network, no storage. server.js wraps them. Messages carry a reference code only,
// never a diagnosis, name or clinical detail (blueprint, Module 2 risks).
//
// Deadlines come from CLINICAL_REVIEW_BRIEF.md (emergency 1 day, urgent 2, routine 7). The blueprint
// suggests hours for an emergency; that is a clinical decision for the reviewer, so it is one constant.
//
// Delivery is part of the safety loop. A message counts as sent only when the SMS gateway accepted
// it: the facility notice (`facilityNotifiedAt`) and the nurse escalation (`escalatedAt`) stay unset
// after a failure, the failure is recorded, and the caller retries on its next run. A referral whose
// escalation never got through must not look handled.
const crypto = require('node:crypto');

const DEADLINE_DAYS = { emergency: 1, urgent: 2, routine: 7 };
const MAX_ATTEMPTS = 5;
// No look-alike characters (0/O, 1/I), so a code read over the phone is not mistyped.
const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
const CODE_LENGTH = 6;
const ID_PATTERN = /^[A-Za-z0-9_-]{1,64}$/;

// Rejection sampling: bytes at or above the largest multiple of the alphabet size are discarded,
// so every character is equally likely (a plain `b % 31` favours the first eight letters).
function newCode(random = crypto.randomBytes) {
  const limit = 256 - (256 % CODE_ALPHABET.length);
  let code = '';
  while (code.length < CODE_LENGTH) {
    for (const b of random(CODE_LENGTH * 2)) {
      if (b < limit && code.length < CODE_LENGTH) code += CODE_ALPHABET[b % CODE_ALPHABET.length];
    }
  }
  return code;
}

function normaliseCode(code) {
  return String(code || '').trim().toUpperCase();
}

function createReferral({ id, urgency, facilityId, nurseId, now = new Date(), code = newCode() }) {
  if (!DEADLINE_DAYS[urgency]) throw new Error(`urgency must be one of ${Object.keys(DEADLINE_DAYS).join(', ')}`);
  if (!id || !facilityId || !nurseId) throw new Error('a referral needs an id, a facility and a nurse');
  for (const [name, value] of Object.entries({ id, facilityId, nurseId })) {
    if (typeof value !== 'string' || !ID_PATTERN.test(value)) {
      throw new Error(`${name} must be 1-64 letters, digits, "-" or "_"`);
    }
  }
  const deadline = new Date(now.getTime() + DEADLINE_DAYS[urgency] * 24 * 60 * 60 * 1000);
  return {
    id, code, urgency, facilityId, nurseId,
    createdAt: now.toISOString(),
    deadlineAt: deadline.toISOString(),
    arrivedAt: null,
    failedAttempts: 0,
    facilityNotifiedAt: null,
    facilityNoticeAttempts: 0,
    facilityNoticeError: null,
    escalatedAt: null,
    escalationAttempts: 0,
    escalationError: null,
  };
}

// The facility enters the code. Wrong codes count against the referral; after MAX_ATTEMPTS it locks,
// so a code cannot be guessed by trying many times.
function confirmArrival(referral, { code, facilityId, now = new Date() }) {
  if (referral.arrivedAt) return { ok: true, referral, note: 'already confirmed' };
  if (referral.failedAttempts >= MAX_ATTEMPTS) return { ok: false, referral, error: 'locked after too many wrong codes' };
  if (facilityId !== referral.facilityId) return { ok: false, referral, error: 'not this facility' };
  if (normaliseCode(code) !== referral.code) {
    return { ok: false, referral: { ...referral, failedAttempts: referral.failedAttempts + 1 }, error: 'wrong code' };
  }
  return { ok: true, referral: { ...referral, arrivedAt: now.toISOString() } };
}

function isOverdue(referral, now = new Date()) {
  return !referral.arrivedAt && now.getTime() > Date.parse(referral.deadlineAt);
}

// Overdue referrals whose escalation has not yet been delivered. A failed attempt keeps a referral in
// this list, so every run retries it until the nurse has actually been told.
function dueForEscalation(referrals, now = new Date()) {
  return referrals.filter(r => isOverdue(r, now) && !r.escalatedAt);
}

// Open referrals whose facility never received the code. Without it the facility cannot confirm
// arrival, so these are retried too.
function dueForFacilityNotice(referrals) {
  return referrals.filter(r => !r.arrivedAt && !r.facilityNotifiedAt);
}

// Record the outcome of one escalation attempt. Only a delivered message marks the referral escalated.
function recordEscalation(referral, { delivered, error = null, now = new Date() }) {
  const attempts = (referral.escalationAttempts || 0) + 1;
  if (delivered) {
    return { ...referral, escalatedAt: now.toISOString(), escalationAttempts: attempts, escalationError: null };
  }
  return { ...referral, escalationAttempts: attempts, escalationError: error || 'not delivered' };
}

function recordFacilityNotice(referral, { delivered, error = null, now = new Date() }) {
  const attempts = (referral.facilityNoticeAttempts || 0) + 1;
  if (delivered) {
    return { ...referral, facilityNotifiedAt: now.toISOString(), facilityNoticeAttempts: attempts, facilityNoticeError: null };
  }
  return { ...referral, facilityNoticeAttempts: attempts, facilityNoticeError: error || 'not delivered' };
}

// Kept for callers that already know delivery succeeded.
function markEscalated(referral, now = new Date()) {
  return recordEscalation(referral, { delivered: true, now });
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
  DEADLINE_DAYS, MAX_ATTEMPTS, CODE_ALPHABET, CODE_LENGTH,
  newCode, normaliseCode, createReferral, confirmArrival, isOverdue,
  dueForEscalation, dueForFacilityNotice, recordEscalation, recordFacilityNotice, markEscalated,
  facilityMessage, nurseEscalationMessage,
};
