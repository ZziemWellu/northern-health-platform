// Module 1 (Risk before crisis): one ranking for the whole task list.
//
// CHT sorts the Tasks tab by `priority.level` (higher first), then by due date, and shows
// `priority.label` on the task. So the nurse's morning list is ordered by clinical urgency, and every
// row carries its reason in plain words instead of an unexplained score.
//
// These levels are rules, not a model. They order the day's work; they never hide a task, so a
// wrong rank can't make a household disappear from the list (blueprint principle: "a floor, never
// a ceiling").
//
// CLINICAL SIGN-OFF REQUIRED: the ordering below follows WHO postnatal guidance (most newborn deaths
// happen in the first week, the first day most of all). It must be confirmed against GHS's own
// protocols by the project's clinical advisor before any field use.

const LEVELS = {
  DANGER_SIGN_FOLLOW_UP: 100,
  NEWBORN_DAY_1: 90,
  NEWBORN_DAY_3: 80,
  NEWBORN_DAY_7: 70,
  DELIVERY_DUE: 50,
  ANC_FACILITY_REMINDER: 40,
  ANC_HOME_VISIT: 30,
};

// Translation keys, so each reason can be shown in the nurse's language (translations/*.properties).
const REASONS = {
  DANGER_SIGN_FOLLOW_UP: 'priority.reason.danger_sign_follow_up',
  NEWBORN_DAY_1: 'priority.reason.newborn_day_1',
  NEWBORN_DAY_3: 'priority.reason.newborn_day_3',
  NEWBORN_DAY_7: 'priority.reason.newborn_day_7',
  DELIVERY_DUE: 'priority.reason.delivery_due',
  ANC_FACILITY_REMINDER: 'priority.reason.anc_facility_reminder',
  ANC_HOME_VISIT: 'priority.reason.anc_home_visit',
};

const priorityFor = (kind) => {
  if (!Object.prototype.hasOwnProperty.call(LEVELS, kind)) {
    throw new Error(`Unknown priority kind: ${kind}`);
  }
  return { level: LEVELS[kind], label: REASONS[kind] };
};

// Newborn home-visit events are identified by their event id (see tasks.js).
const NEWBORN_EVENT_KINDS = {
  'newborn-visit-day-1': 'NEWBORN_DAY_1',
  'newborn-visit-day-3': 'NEWBORN_DAY_3',
  'newborn-visit-day-7': 'NEWBORN_DAY_7',
};

const newbornVisitPriority = (event) => {
  const kind = event && NEWBORN_EVENT_KINDS[event.id];
  if (!kind) {
    throw new Error(`Not a newborn visit event: ${event && event.id}`);
  }
  return priorityFor(kind);
};

module.exports = {
  LEVELS,
  REASONS,
  priorityFor,
  newbornVisitPriority,
  NEWBORN_EVENT_KINDS,
};
