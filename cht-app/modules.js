// Which module each task, target and app form belongs to, and which of them a build includes.
//
// The committed app (app_settings.json, every form) is the FULL build: profile.js says 'all', so
// every test and CI check sees everything. The pilot build (`npm run build-pilot`, tools/pilot_build.js)
// writes a profile.js listing only the pilot's parts and compiles a separate copy of the app.
//
// Parts:
//   reference      cht-core's own pregnancy, delivery and postnatal workflows (config/default)
//   1              Module 1, risk before crisis: newborn visits, maternal danger assessment
//   2.raise        Module 2, raising a referral: the action a danger sign leads to
//   2.loop         Module 2, the arrival loop: confirm arrival, still-open follow-up
//   3 ... 7        the other modules (5 has no CHT forms: its export reads the reports)
//
// Every task, target and app form MUST appear here: test/unit/modules.spec.js fails otherwise, so
// nothing new can slip into the pilot, or out of it, without a decision.
const PARTS = ['reference', '1', '2.raise', '2.loop', '3', '4', '5', '6', '7'];

// The pilot agreed on 8 November 2026: Modules 1 and 5, plus raising a referral (so a danger sign
// still leads to a referral). Arrival tracking (2.loop) and Modules 3, 4, 6 and 7 wait for sign-off.
const PILOT = ['reference', '1', '2.raise', '5'];

const TASKS = {
  'anc.pregnancy_home_visit.known_lmp': 'reference',
  'anc.pregnancy_home_visit.unknown_lmp': 'reference',
  'anc.facility_reminder': 'reference',
  'anc.pregnancy_danger_sign_followup': 'reference',
  'anc.delivery': 'reference',
  'pnc.danger_sign_followup_mother': 'reference',
  'pnc.danger_sign_followup_baby.from_contact': 'reference',
  'pnc.danger_sign_followup_baby.from_report': 'reference',
  'pnc.newborn_home_visit': '1',
  'maternal_danger_follow_up': '1',
  'pnc.newborn_danger_sign_follow_up': '1',
  'referral.raise': '2.raise',
  'referral.confirm_arrival': '2.loop',
  'referral.still_open': '2.loop',
  'barrier.screen': '6',
  'birth_plan.make': '6',
  'birth_plan.complete': '6',
  'barrier.after_missed_referral': '6',
  'barrier.unresolved_late': '6',
  'sick_child.follow_up': '7',
  'smc.catch_up': '7',
  'smc.adherence': '7',
  'smc.next_cycle': '7',
};

const TARGETS = {
  'deaths-this-month': 'reference',
  'pregnancy-registrations-this-month': 'reference',
  'births-this-month': 'reference',
  'active-pregnancies': 'reference',
  'active-pregnancies-1+-visits': 'reference',
  'facility-deliveries': 'reference',
  'active-pregnancies-4+-visits': 'reference',
  'active-pregnancies-8+-contacts': 'reference',
  'referrals-raised': '2.raise',
  'referrals-arrival-confirmed': '2.loop',
  'birth-plans-complete': '6',
  'smc-doses-complete': '7',
};

const FORMS = {
  death_report: 'reference',
  undo_death_report: 'reference',
  delivery: 'reference',
  pregnancy: 'reference',
  pregnancy_home_visit: 'reference',
  pregnancy_danger_sign: 'reference',
  pregnancy_danger_sign_follow_up: 'reference',
  pregnancy_facility_visit_reminder: 'reference',
  pnc_danger_sign_follow_up_baby: 'reference',
  pnc_danger_sign_follow_up_mother: 'reference',
  replace_user: 'reference',
  pnc_home_visit: '1',
  maternal_danger_assessment: '1',
  referral: '2.raise',
  referral_follow_up: '2.loop',
  feeding_counselling: '3',
  market_prices: '3',
  voice_question: '4',
  barrier_screen: '6',
  birth_plan: '6',
  sick_child: '7',
  sick_child_follow_up: '7',
  smc_adherence: '7',
  smc_dose: '7',
};

const MAPS = { task: TASKS, target: TARGETS, form: FORMS };

function enabledParts(profile = require('./profile')) {
  return profile.parts === 'all' ? PARTS : profile.parts;
}

function partOf(kind, id) {
  const map = MAPS[kind];
  if (!map) {
    throw new Error(`unknown kind ${kind}`);
  }
  return Object.prototype.hasOwnProperty.call(map, id) ? map[id] : null;
}

// Keeps the items whose part the profile enables. An untagged item is kept in the full build and
// dropped from a restricted one (and the unit test fails, so it never gets that far unnoticed).
function inProfile(kind, items, profile = require('./profile')) {
  const parts = enabledParts(profile);
  if (profile.parts === 'all') {
    return items;
  }
  const key = kind === 'form' ? (x => x) : (x => (kind === 'task' ? x.name : x.id));
  return items.filter(item => parts.includes(partOf(kind, key(item))));
}

module.exports = { PARTS, PILOT, TASKS, TARGETS, FORMS, enabledParts, partOf, inProfile };
