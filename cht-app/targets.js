const extras = require('./nools-extras');
const {
  isAlive,
  getSubsequentPregnancyFollowUps,
  getMostRecentLMPDateForPregnancy,
  isActivePregnancy,
  countANCFacilityVisits,
  getField
} = extras;

module.exports = [

  {
    id: 'deaths-this-month',
    type: 'count',
    icon: 'icon-death-general',
    goal: 0,
    translation_key: 'targets.death_reporting.deaths.title',
    subtitle_translation_key: 'targets.this_month.subtitle',
    appliesTo: 'contacts',
    appliesToType: ['person'],
    appliesIf: function (contact) {
      return !isAlive(contact);
    },
    date: (contact) => contact.contact.date_of_death
  },

  // ANC: New Pregnancies as a count - this month with LMP, with a goal of 20
  {
    id: 'pregnancy-registrations-this-month',
    type: 'count',
    icon: 'icon-pregnancy',
    goal: 20,
    translation_key: 'targets.anc.new_pregnancy_registrations.title',
    subtitle_translation_key: 'targets.this_month.subtitle',
    appliesTo: 'reports',
    appliesToType: ['pregnancy'],
    appliesIf: function (contact, report) {
      if (!report) {return false;}
      return getMostRecentLMPDateForPregnancy(contact, report);
    },
    date: 'reported',
    idType: 'contact'
  },

  {
    id: 'births-this-month',
    type: 'count',
    icon: 'icon-infant',
    goal: -1,
    translation_key: 'targets.births.title',
    subtitle_translation_key: 'targets.this_month.subtitle',
    appliesTo: 'contacts',
    appliesToType: ['person'],
    appliesIf: function (contact) {
      return contact && contact.contact && contact.contact.date_of_birth;
    },
    date: (contact) => contact.contact.date_of_birth,
    dhis: {
      dataElement: 'kB0ZBFisE0e',
    }
  },


  // ANC: Number of active pregnancies as a count - all time
  {
    id: 'active-pregnancies',
    type: 'count',
    icon: 'icon-pregnancy',
    goal: -1,
    translation_key: 'targets.anc.active_pregnancies.title',
    subtitle_translation_key: 'targets.all_time.subtitle',
    appliesTo: 'reports',
    appliesToType: ['pregnancy'],
    appliesIf: function (contact, report) {
      return isActivePregnancy(contact, report);
    },
    date: 'now',
    idType: 'contact'
  },

  // ANC: Number of active pregnancies as a count - all time - with 1+ facility visits
  {
    id: 'active-pregnancies-1+-visits',
    type: 'count',
    icon: 'icon-clinic',
    goal: -1,
    translation_key: 'targets.anc.active_pregnancies_1p_visits.title',
    subtitle_translation_key: 'targets.all_time.subtitle',
    appliesTo: 'reports',
    appliesToType: ['pregnancy'],
    appliesIf: function (contact, report) {
      if (!isActivePregnancy(contact, report)) {return false;}
      const visitCount = countANCFacilityVisits(contact, report);
      return visitCount > 0;
    },
    date: 'now',
    idType: 'contact'
  },

  {
    id: 'facility-deliveries',
    type: 'percent',
    icon: 'icon-mother-child',
    goal: -1,
    translation_key: 'targets.anc.facility_deliveries.title',
    subtitle_translation_key: 'targets.all_time.subtitle',
    appliesTo: 'reports',
    appliesToType: ['delivery'],
    appliesIf: function (contact, report) {
      return getField(report, 'delivery_outcome.delivery_place');
    },
    passesIf: function (contact, report) {
      return getField(report, 'delivery_outcome.delivery_place') === 'health_facility';
    },
    date: 'now',
    idType: 'contact',
    dhis: {
      dataElement: 'e22tIwy1nKR',
      categoryOptionCombo: 'HllvX50cXC0',
      attributeOptionCombo: 'HllvX50cXC0',
    }
  },

  {
    id: 'active-pregnancies-4+-visits',
    type: 'count',
    icon: 'icon-clinic',
    goal: -1,
    translation_key: 'targets.anc.active_pregnancies_4p_visits.title',
    subtitle_translation_key: 'targets.all_time.subtitle',
    appliesTo: 'reports',
    appliesToType: ['pregnancy'],
    appliesIf: function (contact, report) {
      if (!isActivePregnancy(contact, report)) {return false;}
      const visitCount = countANCFacilityVisits(contact, report);
      return visitCount > 3;
    },
    date: 'now',
    idType: 'contact'
  },
  {
    id: 'active-pregnancies-8+-contacts',
    type: 'count',
    icon: 'icon-follow-up',
    goal: -1,
    translation_key: 'targets.anc.active_pregnancies_8p_contacts.title',
    subtitle_translation_key: 'targets.all_time.subtitle',
    appliesTo: 'reports',
    appliesToType: ['pregnancy'],
    appliesIf: function (contact, report) {
      if (!isActivePregnancy(contact, report)) {return false;}
      const pregnancyRegistrationCount = 1;
      const pregnancyHomeVisitCount = getSubsequentPregnancyFollowUps(contact, report).length || 0;
      const facilityVisitCount = countANCFacilityVisits(contact, report) || 0;
      return pregnancyRegistrationCount + pregnancyHomeVisitCount + facilityVisitCount > 7;
    },
    date: 'now',
    idType: 'contact'
  },

  // Module 2: of this month's referrals, the share where she is confirmed to have arrived.
  // Aggregated for supervisors, so a district sees which nurses' referrals are stalling.
  // Goal 80% is the blueprint's proposed exit target, to agree with the district.
  {
    id: 'referrals-arrival-confirmed',
    type: 'percent',
    icon: 'icon-follow-up',
    goal: 80,
    translation_key: 'targets.referral.arrival_confirmed.title',
    subtitle_translation_key: 'targets.this_month.subtitle',
    appliesTo: 'reports',
    appliesToType: ['referral'],
    passesIf: function (contact, report) {
      return contact.reports.some(r =>
        r.form === 'referral_follow_up' &&
        getField(r, 'inputs.referral_uuid') === report._id &&
        getField(r, 'arrival.arrived') === 'yes'
      );
    },
    date: 'reported',
    idType: 'report',
    aggregate: true,
  },

  // Module 2: referrals raised this month.
  {
    id: 'referrals-raised',
    type: 'count',
    icon: 'icon-follow-up',
    goal: -1,
    translation_key: 'targets.referral.raised.title',
    subtitle_translation_key: 'targets.this_month.subtitle',
    appliesTo: 'reports',
    appliesToType: ['referral'],
    date: 'reported',
    idType: 'report',
    aggregate: true,
  },

  // Module 6: active pregnancies with a complete birth plan (ride, money, blood donor, decider
  // agreement). Aggregated for supervisors.
  {
    id: 'birth-plans-complete',
    type: 'percent',
    icon: 'icon-pregnancy',
    goal: 70,
    translation_key: 'targets.birth_plan.complete.title',
    subtitle_translation_key: 'targets.all_time.subtitle',
    appliesTo: 'reports',
    appliesToType: ['pregnancy'],
    appliesIf: function (contact, report) {
      return isActivePregnancy(contact, report);
    },
    passesIf: function (contact, report) {
      return contact.reports.some(r =>
        r.form === 'birth_plan' &&
        r.reported_date >= report.reported_date &&
        getField(r, 'r_complete') === 'yes'
      );
    },
    date: 'now',
    idType: 'contact',
    aggregate: true,
  },

  // Module 7: SMC cycles where the day-2 and day-3 home doses were both given.
  {
    id: 'smc-doses-complete',
    type: 'percent',
    icon: 'icon-child',
    goal: 90,
    translation_key: 'targets.smc.doses_complete.title',
    subtitle_translation_key: 'targets.this_month.subtitle',
    appliesTo: 'reports',
    appliesToType: ['smc_adherence'],
    passesIf: function (contact, report) {
      return getField(report, 'r_complete') === 'yes';
    },
    date: 'reported',
    idType: 'report',
    aggregate: true,
  },

];
