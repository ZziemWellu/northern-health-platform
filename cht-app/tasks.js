// @ts-nocheck
const extras = require('./nools-extras');

const {
  MAX_DAYS_IN_PREGNANCY,
  today,
  getNewestPregnancyTimestamp,
  getNewestDeliveryTimestamp,
  isAlive,
  isFormArraySubmittedInWindow,
  getDateISOLocal,
  getTimeForMidnight,
  isDeliveryForm,
  getMostRecentLMPDateForPregnancy,
  addDays,
  getRecentANCVisitWithEvent,
  isPregnancyTaskMuted,
  getField,
} = extras;

const { priorityFor, newbornVisitPriority } = require('./priority');

const NEWBORN_TRACKING_DAYS = 10;

const getDeliveryDate = (report) => getDateISOLocal(getField(report, 'delivery_outcome.delivery_date'));

const hasLiveBabies = (report) => Number(getField(report, 'delivery_outcome.babies_alive_num')) > 0;

// Module 2: a referral stays open until a follow-up records the outcome for that specific referral.
// "At or after" `since`, excluding the report that started the wait: two reports can share a
// timestamp (fast data entry, or a device clock that didn't move).
const referralFollowUps = (contact, referralId, since, excludeId) => contact.reports.filter(r =>
  r.form === 'referral_follow_up' &&
  r._id !== excludeId &&
  getField(r, 'inputs.referral_uuid') === referralId &&
  r.reported_date >= since
);

const referralFollowUpContent = (content, referralId, code, destination) => {
  content.referral_uuid = referralId;
  content.referral_code = code;
  content.destination_name = destination;
};

// Module 6 helpers.
const BARRIER_REASONS = ['no_transport', 'no_money', 'family_did_not_agree', 'too_far'];

const submittedSince = (contact, forms, since, excludeId) => contact.reports.some(r =>
  forms.includes(r.form) && r._id !== excludeId && r.reported_date >= since
);

const pregnancyEnded = (contact, pregnancyReport) =>
  isPregnancyTaskMuted(contact) ||
  submittedSince(contact, ['delivery'], pregnancyReport.reported_date) ||
  !!getRecentANCVisitWithEvent(contact, pregnancyReport, 'abortion') ||
  !!getRecentANCVisitWithEvent(contact, pregnancyReport, 'miscarriage');

// Module 1: newborn home visits on day 1, 3 and 7 after birth. The reference config tracked newborns
// only after a danger sign; routine first-week checks are where most newborn deaths can be caught.
// Windows don't overlap, so one visit resolves exactly one event.
const generateNewbornVisitEvent = (id, day, start, end) => ({
  id,
  start,
  end,
  dueDate: function (event, contact, report) {
    return addDays(getDeliveryDate(report), day);
  },
});

const generateEventForHomeVisit = (week, start, end) => ({
  id: `pregnancy-home-visit-week${week}`,
  start,
  end,
  dueDate: function (event, contact, report) {
    const recentLMPDate = getMostRecentLMPDateForPregnancy(contact, report);
    if (recentLMPDate) {
      return addDays(recentLMPDate, week * 7);
    }
    return addDays(report.reported_date, week * 7);
  },
});

function checkTaskResolvedForHomeVisit(contact, report, event, dueDate) {
  //delivery form submitted
  if (report.reported_date < getNewestDeliveryTimestamp(contact)) {
    return true;
  }

  //old pregnancy report
  if (report.reported_date < getNewestPregnancyTimestamp(contact)) {
    return true;
  }

  //miscarriage or abortion
  if (
    getRecentANCVisitWithEvent(contact, report, 'abortion') ||
    getRecentANCVisitWithEvent(contact, report, 'miscarriage')
  ) {
    return true;
  }

  //Due date older than reported day
  if (dueDate <= getTimeForMidnight(report.reported_date)) {
    return true;
  }

  //Tasks cleared
  if (isPregnancyTaskMuted(contact)) {
    return true;
  }
  const startTime = Math.max(
    addDays(dueDate, -event.start).getTime(),
    report.reported_date
  );
  const endTime = addDays(dueDate, event.end + 1).getTime();
  return isFormArraySubmittedInWindow(
    contact.reports,
    ['pregnancy_home_visit'],
    startTime,
    endTime
  );
}

module.exports = [
  //ANC Home Visit: 12, 20, 26, 30, 34, 36, 38, 40 weeks (Known LMP)
  {
    name: 'anc.pregnancy_home_visit.known_lmp',
    icon: 'icon-pregnancy',
    title: 'task.anc.pregnancy_home_visit.title',
    appliesTo: 'reports',
    appliesToType: ['pregnancy'],
    appliesIf: function (contact, report) {
      // If LMP date is known
      return !!getMostRecentLMPDateForPregnancy(contact, report);
    },

    resolvedIf: checkTaskResolvedForHomeVisit,
    priority: () => priorityFor('ANC_HOME_VISIT'),

    actions: [
      {
        type: 'report',
        form: 'pregnancy_home_visit',
        label: 'Pregnancy home visit',
      },
    ],
    events: [
      generateEventForHomeVisit(12, 7, 14),
      generateEventForHomeVisit(20, 7, 14),
      generateEventForHomeVisit(26, 7, 14),
      generateEventForHomeVisit(30, 7, 14),
      generateEventForHomeVisit(34, 6, 7),
      generateEventForHomeVisit(36, 6, 7),
      generateEventForHomeVisit(38, 6, 7),
      generateEventForHomeVisit(40, 6, 7),
    ],
  },

  //ANC Home Visit: show every 2 weeks (Unknown LMP)
  {
    name: 'anc.pregnancy_home_visit.unknown_lmp',
    icon: 'icon-pregnancy',
    title: 'task.anc.pregnancy_home_visit.title',
    appliesTo: 'reports',
    appliesToType: ['pregnancy'],
    appliesIf: function (contact, report) {
      // If LMP date is unknown
      const recentLMP = getMostRecentLMPDateForPregnancy(contact, report);
      //We only want to show until 42 weeks + 7 days
      return (
        !recentLMP &&
        addDays(report.reported_date, MAX_DAYS_IN_PREGNANCY + 7) >= today
      );
    },

    resolvedIf: checkTaskResolvedForHomeVisit,
    priority: () => priorityFor('ANC_HOME_VISIT'),

    actions: [
      {
        type: 'report',
        form: 'pregnancy_home_visit',
        label: 'Pregnancy home visit',
      },
    ],
    //every two weeks from reported date until 42nd week, show before due date: 6 days, show after due date: 7 days
    events: [...Array(21).keys()].map(i => generateEventForHomeVisit((i + 1) * 2, 6, 7)
    ),
  },

  //ANC - Health Facility Visit Reminder
  {
    name: 'anc.facility_reminder',
    icon: 'icon-pregnancy',
    title: 'task.anc.facility_reminder.title',
    appliesTo: 'reports',
    appliesToType: ['pregnancy', 'pregnancy_home_visit'],
    appliesIf: function (contact, report) {
      //next pregnancy visit date is entered
      return getField(report, 't_pregnancy_follow_up_date');
    },

    resolvedIf: function (contact, report, event, dueDate) {
      //(refused or migrated) and cleared tasks
      if (isPregnancyTaskMuted(contact)) {
        return true;
      }
      const startTime = Math.max(
        addDays(dueDate, -event.start).getTime(),
        report.reported_date
      );
      const endTime = addDays(dueDate, event.end + 1).getTime();
      return isFormArraySubmittedInWindow(
        contact.reports,
        ['pregnancy_facility_visit_reminder'],
        startTime,
        endTime
      );
    },
    priority: () => priorityFor('ANC_FACILITY_REMINDER'),
    actions: [
      {
        type: 'report',
        form: 'pregnancy_facility_visit_reminder',
        label: 'Pregnancy facility visit reminder',
        modifyContent: function (content, contact, report) {
          content.source_visit_date = getField(
            report,
            't_pregnancy_follow_up_date'
          );
        },
      },
    ],
    events: [
      {
        id: 'pregnancy-facility-visit-reminder',
        start: 3,
        end: 7,
        dueDate: function (event, contact, report) {
          //next visit date
          return getDateISOLocal(
            getField(report, 't_pregnancy_follow_up_date')
          );
        },
      },
    ],
  },

  {
    name: 'anc.pregnancy_danger_sign_followup',
    icon: 'icon-pregnancy-danger',
    title: 'task.anc.pregnancy_danger_sign_followup.title',
    appliesTo: 'reports',
    appliesToType: [
      'pregnancy',
      'pregnancy_home_visit',
      'pregnancy_danger_sign',
      'pregnancy_danger_sign_follow_up',
    ],
    appliesIf: function (contact, report) {
      return (
        getField(report, 't_danger_signs_referral_follow_up') === 'yes' &&
        isAlive(contact)
      );
    },
    resolvedIf: function (contact, report, event, dueDate) {
      //(refused or migrated) and cleared tasks
      if (isPregnancyTaskMuted(contact)) {
        return true;
      }
      const startTime = Math.max(
        addDays(dueDate, -event.start).getTime(),
        report.reported_date + 1
      );
      const endTime = addDays(dueDate, event.end + 1).getTime();
      return isFormArraySubmittedInWindow(
        contact.reports,
        ['pregnancy_danger_sign_follow_up'],
        startTime,
        endTime
      );
    },
    priority: () => priorityFor('DANGER_SIGN_FOLLOW_UP'),
    actions: [
      {
        type: 'report',
        form: 'pregnancy_danger_sign_follow_up',
      },
    ],
    events: [
      {
        id: 'pregnancy-danger-sign-follow-up',
        start: 3,
        end: 7,
        dueDate: function (event, contact, report) {
          return getDateISOLocal(
            getField(report, 't_danger_signs_referral_follow_up_date')
          );
        },
      },
    ],
  },

  {
    name: 'anc.delivery',
    icon: 'icon-mother-child',
    title: 'task.anc.delivery.title',
    appliesTo: 'reports',
    appliesToType: ['pregnancy'],
    appliesIf: function (contact, report) {
      const lmpDate = getMostRecentLMPDateForPregnancy(contact, report);
      //only for known LMP, show for maximum of 42 + 6 weeks
      return lmpDate && addDays(lmpDate, 336) >= today && isAlive(contact);
    },
    resolvedIf: function (contact, report, event, dueDate) {
      //miscarriage or abortion
      if (
        getRecentANCVisitWithEvent(contact, report, 'abortion') ||
        getRecentANCVisitWithEvent(contact, report, 'miscarriage')
      ) {
        return true;
      }

      //(refused or migrated) and cleared tasks
      if (isPregnancyTaskMuted(contact)) {
        return true;
      }
      const startTime = Math.max(
        addDays(dueDate, -event.start).getTime(),
        report.reported_date
      );
      const endTime = addDays(dueDate, event.end + 1).getTime();
      return isFormArraySubmittedInWindow(
        contact.reports,
        ['delivery'],
        startTime,
        endTime
      );
    },
    priority: () => priorityFor('DELIVERY_DUE'),
    actions: [
      {
        type: 'report',
        form: 'delivery',
      },
    ],
    events: [
      {
        id: 'delivery-reminder',
        start: 4 * 7,
        end: 6 * 7,
        dueDate: function (event, contact, report) {
          return addDays(
            getMostRecentLMPDateForPregnancy(contact, report),
            MAX_DAYS_IN_PREGNANCY
          ); //LMP + 42 weeks
        },
      },
    ],
  },

  {
    name: 'pnc.danger_sign_followup_mother',
    icon: 'icon-follow-up',
    title: 'task.pnc.danger_sign_followup_mother.title',
    appliesTo: 'reports',
    appliesToType: ['delivery', 'pnc_danger_sign_follow_up_mother'],
    appliesIf: function (contact, report) {
      return (
        getField(report, 't_danger_signs_referral_follow_up') === 'yes' &&
        isAlive(contact)
      );
    },
    resolvedIf: function (contact, report, event, dueDate) {
      //(refused or migrated) and cleared tasks
      if (isPregnancyTaskMuted(contact)) {
        return true;
      }
      const startTime = Math.max(
        addDays(dueDate, -event.start).getTime(),
        report.reported_date + 1
      ); //+1 so that source ds_follow_up does not resolve itself;
      const endTime = addDays(dueDate, event.end + 1).getTime();
      return isFormArraySubmittedInWindow(
        contact.reports,
        ['pnc_danger_sign_follow_up_mother'],
        startTime,
        endTime
      );
    },
    priority: () => priorityFor('DANGER_SIGN_FOLLOW_UP'),
    actions: [
      {
        type: 'report',
        form: 'pnc_danger_sign_follow_up_mother',
        modifyContent: function (content, contact, report) {
          if (isDeliveryForm(report)) {
            content.delivery_uuid = report._id;
          } else {
            content.delivery_uuid = getField(report, 'inputs.delivery_uuid');
          }
        },
      },
    ],
    events: [
      {
        id: 'pnc-danger-sign-follow-up-mother',
        start: 3,
        end: 7,
        dueDate: function (event, contact, report) {
          return getDateISOLocal(
            getField(report, 't_danger_signs_referral_follow_up_date')
          );
        },
      },
    ],
  },

  {
    name: 'pnc.danger_sign_followup_baby.from_contact',
    icon: 'icon-follow-up',
    title: 'task.pnc.danger_sign_followup_baby.title',
    appliesTo: 'contacts',
    appliesToType: ['person'],
    appliesIf: function (contact) {
      return (
        contact.contact &&
        contact.contact.t_danger_signs_referral_follow_up === 'yes' &&
        isAlive(contact)
      );
    },
    resolvedIf: function (contact, report, event, dueDate) {
      const startTime = Math.max(
        addDays(dueDate, -event.start).getTime(),
        contact.contact.reported_date
      );
      const endTime = addDays(dueDate, event.end).getTime();
      return isFormArraySubmittedInWindow(
        contact.reports,
        ['pnc_danger_sign_follow_up_baby'],
        startTime,
        endTime
      );
    },
    priority: () => priorityFor('DANGER_SIGN_FOLLOW_UP'),
    actions: [
      {
        type: 'report',
        form: 'pnc_danger_sign_follow_up_baby',
        modifyContent: function (content, contact) {
          content.delivery_uuid = contact.contact.created_by_doc;
        },
      },
    ],
    events: [
      {
        id: 'pnc-danger-sign-follow-up-baby',
        start: 3,
        end: 7,
        dueDate: function (event, contact) {
          return getDateISOLocal(
            contact.contact.t_danger_signs_referral_follow_up_date
          );
        },
      },
    ],
  },

  {
    name: 'pnc.danger_sign_followup_baby.from_report',
    icon: 'icon-follow-up',
    title: 'task.pnc.danger_sign_followup_baby.title',
    appliesTo: 'reports',
    appliesToType: ['pnc_danger_sign_follow_up_baby'],
    appliesIf: function (contact, report) {
      return (
        getField(report, 't_danger_signs_referral_follow_up') === 'yes' &&
        isAlive(contact)
      );
    },
    resolvedIf: function (contact, report, event, dueDate) {
      //(refused or migrated) and cleared tasks
      if (isPregnancyTaskMuted(contact)) {
        return true;
      }
      const startTime = Math.max(
        addDays(dueDate, -event.start).getTime(),
        report.reported_date + 1
      );
      //reported_date + 1 so that source ds_follow_up does not resolve itself
      const endTime = addDays(dueDate, event.end + 1).getTime();
      return isFormArraySubmittedInWindow(
        contact.reports,
        ['pnc_danger_sign_follow_up_baby'],
        startTime,
        endTime
      );
    },
    priority: () => priorityFor('DANGER_SIGN_FOLLOW_UP'),
    actions: [
      {
        type: 'report',
        form: 'pnc_danger_sign_follow_up_baby',
        modifyContent: function (content, contact, report) {
          content.delivery_uuid = getField(report, 'inputs.delivery_uuid');
        },
      },
    ],
    events: [
      {
        id: 'pnc-danger-sign-follow-up-baby',
        start: 3,
        end: 7,
        dueDate: function (event, contact, report) {
          return getDateISOLocal(
            getField(report, 't_danger_signs_referral_follow_up_date')
          );
        },
      },
    ],
  },

  // Module 1: routine newborn home visits (day 1, 3, 7), on the mother's record, ranked above
  // everything except danger-sign follow-ups.
  {
    name: 'pnc.newborn_home_visit',
    icon: 'icon-mother-child',
    title: 'task.pnc.newborn_home_visit.title',
    appliesTo: 'reports',
    appliesToType: ['delivery'],
    appliesIf: function (contact, report) {
      const deliveryDate = getDeliveryDate(report);
      return (
        isAlive(contact) &&
        hasLiveBabies(report) &&
        !!deliveryDate &&
        addDays(deliveryDate, NEWBORN_TRACKING_DAYS + 1) >= today
      );
    },
    resolvedIf: function (contact, report, event, dueDate) {
      // A newer delivery report supersedes this one.
      if (report.reported_date < getNewestDeliveryTimestamp(contact)) {
        return true;
      }
      // The nurse cleared this household's tasks (refused care or moved away).
      if (isPregnancyTaskMuted(contact)) {
        return true;
      }
      const startTime = Math.max(
        addDays(dueDate, -event.start).getTime(),
        getDeliveryDate(report).getTime()
      );
      const endTime = addDays(dueDate, event.end + 1).getTime();
      return isFormArraySubmittedInWindow(
        contact.reports,
        ['pnc_home_visit'],
        startTime,
        endTime
      );
    },
    priority: function (contact, report, event) {
      return newbornVisitPriority(event);
    },
    actions: [
      {
        type: 'report',
        form: 'pnc_home_visit',
        modifyContent: function (content, contact, report) {
          content.delivery_uuid = report._id;
        },
      },
    ],
    events: [
      generateNewbornVisitEvent('newborn-visit-day-1', 0, 0, 2),
      generateNewbornVisitEvent('newborn-visit-day-3', 3, 0, 2),
      generateNewbornVisitEvent('newborn-visit-day-7', 7, 1, 3),
    ],
  },

  // Module 2: anyone flagged emergency or urgent must have a referral raised the same day: a woman
  // (maternal danger assessment) or a child (Module 7 sick child and its day-3 check). This is the
  // top of the list until it's done.
  {
    name: 'referral.raise',
    icon: 'icon-pregnancy-danger',
    title: 'task.referral.raise.title',
    appliesTo: 'reports',
    appliesToType: ['maternal_danger_assessment', 'sick_child', 'sick_child_follow_up'],
    appliesIf: function (contact, report) {
      return ['emergency', 'urgent'].includes(getField(report, 'r_severity')) && isAlive(contact);
    },
    resolvedIf: function (contact, report) {
      if (isPregnancyTaskMuted(contact)) {
        return true;
      }
      return contact.reports.some(r => r.form === 'referral' && r.reported_date >= report.reported_date);
    },
    // An emergency (go now) outranks everything; an urgent referral (go today) sits just below
    // yesterday's danger-sign follow-ups, so a child with no malaria test never ranks level with a
    // woman who is convulsing.
    priority: function (contact, report) {
      return priorityFor(getField(report, 'r_severity') === 'emergency' ? 'RAISE_REFERRAL' : 'RAISE_REFERRAL_URGENT');
    },
    actions: [
      {
        type: 'report',
        form: 'referral',
        modifyContent: function (content, contact, report) {
          content.source_reasons = getField(report, 'r_reasons');
          content.source_severity = getField(report, 'r_severity');
        },
      },
    ],
    events: [
      {
        id: 'referral-raise',
        start: 0,
        end: 2,
        dueDate: function (event, contact, report) {
          return getTimeForMidnight(report.reported_date);
        },
      },
    ],
  },

  // Module 2: confirm arrival by the referral's deadline (1 day emergency, 2 urgent, 7 routine).
  // Shown from the day of referral so the nurse can confirm early.
  {
    name: 'referral.confirm_arrival',
    icon: 'icon-follow-up',
    title: 'task.referral.confirm_arrival.title',
    appliesTo: 'reports',
    appliesToType: ['referral'],
    appliesIf: function (contact) {
      return isAlive(contact);
    },
    resolvedIf: function (contact, report) {
      if (isPregnancyTaskMuted(contact)) {
        return true;
      }
      return referralFollowUps(contact, report._id, report.reported_date, report._id).length > 0;
    },
    priority: () => priorityFor('REFERRAL_UNCONFIRMED'),
    actions: [
      {
        type: 'report',
        form: 'referral_follow_up',
        modifyContent: function (content, contact, report) {
          referralFollowUpContent(content, report._id, getField(report, 'referral_code'), getField(report, 'r_destination_name'));
        },
      },
    ],
    events: [
      {
        id: 'referral-confirm-arrival',
        start: 7,
        end: 14,
        dueDate: function (event, contact, report) {
          return addDays(report.reported_date, Number(getField(report, 'r_deadline_days')) || 1);
        },
      },
    ],
  },

  // Module 2: a follow-up that leaves the referral open (not yet arrived, or still needs care)
  // brings the nurse back the next day, until a follow-up closes it.
  {
    name: 'referral.still_open',
    icon: 'icon-follow-up',
    title: 'task.referral.still_open.title',
    appliesTo: 'reports',
    appliesToType: ['referral_follow_up'],
    appliesIf: function (contact, report) {
      return getField(report, 't_referral_follow_up') === 'yes' && isAlive(contact);
    },
    resolvedIf: function (contact, report) {
      if (isPregnancyTaskMuted(contact)) {
        return true;
      }
      return referralFollowUps(contact, getField(report, 'inputs.referral_uuid'), report.reported_date, report._id).length > 0;
    },
    priority: () => priorityFor('REFERRAL_UNCONFIRMED'),
    actions: [
      {
        type: 'report',
        form: 'referral_follow_up',
        modifyContent: function (content, contact, report) {
          referralFollowUpContent(content, getField(report, 'inputs.referral_uuid'),
            getField(report, 'inputs.referral_code'), getField(report, 'inputs.destination_name'));
        },
      },
    ],
    events: [
      {
        id: 'referral-still-open',
        start: 0,
        end: 7,
        dueDate: function (event, contact, report) {
          return addDays(report.reported_date, 1);
        },
      },
    ],
  },

  // Module 6: screen every new pregnancy for barriers within its first weeks on the register.
  {
    name: 'barrier.screen',
    icon: 'icon-pregnancy',
    title: 'task.barrier.screen.title',
    appliesTo: 'reports',
    appliesToType: ['pregnancy'],
    appliesIf: function (contact, report) {
      return isAlive(contact) && report.reported_date === getNewestPregnancyTimestamp(contact);
    },
    resolvedIf: function (contact, report) {
      return pregnancyEnded(contact, report) ||
        submittedSince(contact, ['barrier_screen'], report.reported_date);
    },
    priority: () => priorityFor('BARRIER_SCREEN'),
    actions: [{ type: 'report', form: 'barrier_screen' }],
    events: [
      {
        id: 'barrier-screen',
        start: 7,
        end: 28,
        dueDate: function (event, contact, report) {
          return addDays(report.reported_date, 7);
        },
      },
    ],
  },

  // Module 6: a birth plan made with the decider by 32 weeks (or 4 weeks after registration if
  // the LMP is unknown).
  {
    name: 'birth_plan.make',
    icon: 'icon-pregnancy',
    title: 'task.birth_plan.make.title',
    appliesTo: 'reports',
    appliesToType: ['pregnancy'],
    appliesIf: function (contact, report) {
      return isAlive(contact) && report.reported_date === getNewestPregnancyTimestamp(contact);
    },
    resolvedIf: function (contact, report) {
      return pregnancyEnded(contact, report) ||
        submittedSince(contact, ['birth_plan'], report.reported_date);
    },
    priority: () => priorityFor('BIRTH_PLAN'),
    actions: [{ type: 'report', form: 'birth_plan' }],
    events: [
      {
        id: 'birth-plan-by-32-weeks',
        start: 56,
        end: 84,
        dueDate: function (event, contact, report) {
          const lmp = getMostRecentLMPDateForPregnancy(contact, report);
          return lmp ? addDays(lmp, 32 * 7) : addDays(report.reported_date, 28);
        },
      },
    ],
  },

  // Module 6: an incomplete birth plan comes back in two weeks, until it is complete or she delivers.
  {
    name: 'birth_plan.complete',
    icon: 'icon-pregnancy',
    title: 'task.birth_plan.complete.title',
    appliesTo: 'reports',
    appliesToType: ['birth_plan'],
    appliesIf: function (contact, report) {
      return getField(report, 't_birth_plan_incomplete') === 'yes' && isAlive(contact);
    },
    resolvedIf: function (contact, report) {
      return isPregnancyTaskMuted(contact) ||
        submittedSince(contact, ['delivery'], report.reported_date) ||
        submittedSince(contact, ['birth_plan'], report.reported_date, report._id);
    },
    priority: () => priorityFor('BIRTH_PLAN'),
    actions: [{ type: 'report', form: 'birth_plan' }],
    events: [
      {
        id: 'birth-plan-complete',
        start: 7,
        end: 21,
        dueDate: function (event, contact, report) {
          return addDays(report.reported_date, 14);
        },
      },
    ],
  },

  // Module 6: a referral that failed for transport, money, family or distance triggers a barrier
  // check the same day, carrying the reasons she gave.
  {
    name: 'barrier.after_missed_referral',
    icon: 'icon-follow-up',
    title: 'task.barrier.after_missed_referral.title',
    appliesTo: 'reports',
    appliesToType: ['referral_follow_up'],
    appliesIf: function (contact, report) {
      const reasons = (getField(report, 'arrival.not_arrived_reasons') || '').split(' ');
      return isAlive(contact) && getField(report, 'arrival.arrived') === 'no' &&
        reasons.some(r => BARRIER_REASONS.includes(r));
    },
    resolvedIf: function (contact, report) {
      return isPregnancyTaskMuted(contact) ||
        submittedSince(contact, ['barrier_screen'], report.reported_date);
    },
    priority: () => priorityFor('BARRIER_AFTER_MISSED_REFERRAL'),
    actions: [
      {
        type: 'report',
        form: 'barrier_screen',
        modifyContent: function (content, contact, report) {
          content.source_reasons = getField(report, 'arrival.not_arrived_reasons');
        },
      },
    ],
    events: [
      {
        id: 'barrier-after-missed-referral',
        start: 0,
        end: 3,
        dueDate: function (event, contact, report) {
          return getTimeForMidnight(report.reported_date);
        },
      },
    ],
  },

  // Module 7: every child treated at home is seen again on day 3.
  {
    name: 'sick_child.follow_up',
    icon: 'icon-child',
    title: 'task.sick_child.follow_up.title',
    appliesTo: 'reports',
    appliesToType: ['sick_child'],
    appliesIf: function (contact, report) {
      return getField(report, 't_sick_child_follow_up') === 'yes' && isAlive(contact);
    },
    resolvedIf: function (contact, report) {
      return submittedSince(contact, ['sick_child_follow_up'], report.reported_date);
    },
    priority: () => priorityFor('SICK_CHILD_FOLLOW_UP'),
    actions: [
      {
        type: 'report',
        form: 'sick_child_follow_up',
        modifyContent: function (content, contact, report) {
          content.treatments = getField(report, 'r_treatments');
        },
      },
    ],
    events: [
      {
        id: 'sick-child-day-3',
        start: 1,
        end: 3,
        dueDate: function (event, contact, report) {
          return addDays(report.reported_date, 3);
        },
      },
    ],
  },

  // Module 7: an SMC dose missed because the child was away gets a catch-up visit the next day.
  // (Caregiver absence was the main cause of missed doses in Upper East, Ayamba et al. 2025.)
  {
    name: 'smc.catch_up',
    icon: 'icon-child',
    title: 'task.smc.catch_up.title',
    appliesTo: 'reports',
    appliesToType: ['smc_dose'],
    appliesIf: function (contact, report) {
      return getField(report, 'r_catch_up') === 'yes' && isAlive(contact);
    },
    resolvedIf: function (contact, report) {
      return submittedSince(contact, ['smc_dose'], report.reported_date, report._id);
    },
    priority: () => priorityFor('SMC_CATCH_UP'),
    actions: [{ type: 'report', form: 'smc_dose' }],
    events: [
      {
        id: 'smc-catch-up',
        start: 0,
        end: 4,
        dueDate: function (event, contact, report) {
          return addDays(report.reported_date, 1);
        },
      },
    ],
  },

  // Module 7: check the day-2 and day-3 home doses.
  {
    name: 'smc.adherence',
    icon: 'icon-child',
    title: 'task.smc.adherence.title',
    appliesTo: 'reports',
    appliesToType: ['smc_dose'],
    appliesIf: function (contact, report) {
      return getField(report, 'dose.day1_given') === 'yes' && isAlive(contact);
    },
    resolvedIf: function (contact, report) {
      return submittedSince(contact, ['smc_adherence'], report.reported_date);
    },
    priority: () => priorityFor('SMC_ADHERENCE'),
    actions: [
      {
        type: 'report',
        form: 'smc_adherence',
        modifyContent: function (content, contact, report) {
          content.cycle = getField(report, 'dose.cycle');
        },
      },
    ],
    events: [
      {
        id: 'smc-adherence',
        start: 0,
        end: 3,
        dueDate: function (event, contact, report) {
          return addDays(report.reported_date, 2);
        },
      },
    ],
  },

  // Module 7: the next monthly SMC cycle, until cycle 4.
  {
    name: 'smc.next_cycle',
    icon: 'icon-child',
    title: 'task.smc.next_cycle.title',
    appliesTo: 'reports',
    appliesToType: ['smc_dose'],
    appliesIf: function (contact, report) {
      return getField(report, 'dose.day1_given') === 'yes' &&
        Number(getField(report, 'dose.cycle')) < 4 && isAlive(contact);
    },
    resolvedIf: function (contact, report) {
      return submittedSince(contact, ['smc_dose'], report.reported_date, report._id);
    },
    priority: () => priorityFor('SMC_NEXT_CYCLE'),
    actions: [{ type: 'report', form: 'smc_dose' }],
    events: [
      {
        id: 'smc-next-cycle',
        start: 3,
        end: 7,
        dueDate: function (event, contact, report) {
          return addDays(report.reported_date, 28);
        },
      },
    ],
  },

  // Module 1: a woman flagged by the maternal danger assessment is followed up the next day, at the
  // top of the list, until a reassessment finds no danger sign. (Referral tracking itself belongs
  // to Module 2.)
  {
    name: 'maternal_danger_follow_up',
    icon: 'icon-pregnancy-danger',
    title: 'task.maternal_danger_follow_up.title',
    appliesTo: 'reports',
    appliesToType: ['maternal_danger_assessment'],
    appliesIf: function (contact, report) {
      return getField(report, 't_maternal_danger_follow_up') === 'yes' && isAlive(contact);
    },
    resolvedIf: function (contact, report, event, dueDate) {
      if (isPregnancyTaskMuted(contact)) {
        return true;
      }
      const startTime = Math.max(
        addDays(dueDate, -event.start).getTime(),
        report.reported_date + 1
      );
      const endTime = addDays(dueDate, event.end + 1).getTime();
      return isFormArraySubmittedInWindow(
        contact.reports,
        ['maternal_danger_assessment'],
        startTime,
        endTime
      );
    },
    priority: () => priorityFor('DANGER_SIGN_FOLLOW_UP'),
    actions: [
      {
        type: 'report',
        form: 'maternal_danger_assessment',
      },
    ],
    events: [
      {
        id: 'maternal-danger-follow-up',
        start: 0,
        end: 3,
        dueDate: function (event, contact, report) {
          return addDays(report.reported_date, 1);
        },
      },
    ],
  },

  // Module 1: a danger sign found at a newborn home visit brings the nurse back the next day,
  // at the top of the list.
  {
    name: 'pnc.newborn_danger_sign_follow_up',
    icon: 'icon-follow-up',
    title: 'task.pnc.newborn_danger_sign_follow_up.title',
    appliesTo: 'reports',
    appliesToType: ['pnc_home_visit'],
    appliesIf: function (contact, report) {
      return getField(report, 't_newborn_danger_follow_up') === 'yes' && isAlive(contact);
    },
    resolvedIf: function (contact, report, event, dueDate) {
      if (isPregnancyTaskMuted(contact)) {
        return true;
      }
      const startTime = Math.max(
        addDays(dueDate, -event.start).getTime(),
        report.reported_date + 1
      );
      const endTime = addDays(dueDate, event.end + 1).getTime();
      return isFormArraySubmittedInWindow(
        contact.reports,
        ['pnc_home_visit'],
        startTime,
        endTime
      );
    },
    priority: () => priorityFor('DANGER_SIGN_FOLLOW_UP'),
    actions: [
      {
        type: 'report',
        form: 'pnc_home_visit',
        modifyContent: function (content, contact, report) {
          content.delivery_uuid = getField(report, 'inputs.delivery_uuid');
        },
      },
    ],
    events: [
      {
        id: 'newborn-danger-sign-follow-up',
        start: 0,
        end: 3,
        dueDate: function (event, contact, report) {
          return addDays(report.reported_date, 1);
        },
      },
    ],
  },
];
