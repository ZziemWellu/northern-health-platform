// The demo district: made-up people in a made-up Kumbungu district, for showing the pilot app to a
// district, a funder or a partner. SYNTHETIC DATA ONLY. No real person, household or record.
//
// Place names are real Kumbungu communities and health centres, so the demo reads like the district
// it is meant for. Every person, household, visit and record is invented. The district and every
// CHPS zone carry "(demo)" in their names, so a screenshot cannot be mistaken for real data.
//
// Each woman's history is written as dated events, relative to the day the demo is seeded, so the
// demo always looks current: tasks are due today, and last month has reports for Module 5. Re-seed
// on the morning of a demo (see docs/pitch/DEMO_SETUP.md).
//
// Events are filled through the real forms in the CHT test harness (demo/generate.js), so every
// report has the same fields the app itself would write.

const DAY = 864e5;
const TAG = 'nhp-demo-kumbungu-v1';
const ID = suffix => `demo-kbg-${suffix}`;

// Emergency referrals from Kumbungu go to a Northern Region hospital (the form lists only level 1-3
// facilities for an emergency); urgent ones to a facility in the district.
const EMERGENCY_HOSPITAL = ['northern', 'tamale_central_hospital_northern'];
const DISTRICT_FACILITY = ['northern', 'kumbungu', 'kunbungu_health_centre_northern'];

// ---- dates -------------------------------------------------------------------------------------

// `today` is midnight UTC (Ghana is UTC all year) of the seeding day.
function clock(today, nowMs) {
  const t0 = Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate());
  const prevMonthStart = Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1);
  return {
    // `days` before today, at `hour` o'clock.
    ago: (days, hour = 10) => t0 - days * DAY + hour * 3600e3,
    // Day `day` of last month (1-28), at `hour`: these reports land in last month's Module 5 file.
    lastMonth: (day, hour = 10) => prevMonthStart + (day - 1) * DAY + hour * 3600e3,
    // A few hours before the seed runs: an event that happened "this morning".
    hoursAgo: hours => Math.min(nowMs - hours * 3600e3, t0 + 23 * 3600e3),
    // About `days` ago, but never before the 1st of this month, so it counts on "this month" targets.
    // (Seed during the day: on the 1st, an event cannot be both this month and before now at night.)
    thisMonth: (days, hour = 9) => {
      const dayOfMonth = new Date(t0).getUTCDate();
      return Math.min(t0 - Math.min(days, dayOfMonth - 1) * DAY + hour * 3600e3, nowMs - 1800e3);
    },
    iso: ms => new Date(ms).toISOString().slice(0, 10),
    yearsAgo: years => new Date(Date.UTC(today.getUTCFullYear() - years, (today.getUTCMonth() + 5) % 12, 12)).toISOString().slice(0, 10),
    DAY,
  };
}

// ---- form answers (page by page, as in test/form-inputs.js and the Module 1 tests) -------------

// The pregnancy forms show some pages only in some situations (cht-core config/default rules), so
// the answers follow the same rules:
//   - deworming is asked at every visit after 12 weeks (the form does not look at earlier answers);
//   - the HIV test question is asked until a test is recorded (recorded here at registration);
//   - "did she attend her last ANC visit?" appears only when an ANC date was booked; the demo
//     books none, so the nurse's own visits drive the story.
const weeksBetween = (lmp, at) => (at - lmp) / (7 * DAY);
const answers = {
  // Pregnancy registration with a known last period, no danger signs.
  pregnancy: ({ lmp, at, iso }) => [
    ['method_lmp'], [iso(lmp)], [], ['0'], ['no'], [], ['no', 'no'], ['none', 'no'],
    Array(11).fill('no'), ['yes'], ['yes'],
    ...(weeksBetween(lmp, at) > 12 ? [['yes']] : []),
    [], ['yes'], [],
  ],
  // Routine pregnancy home visit: well, no new risks, no danger signs, sleeps under a net.
  pregnancyHomeVisit: ({ deworm }) => [
    ['yes', 'yes'], ['no'], ['none', 'no'], ['no'], [], Array(11).fill('no'),
    ['yes'], ['yes'], ...(deworm ? [['yes']] : []), [], [],
  ],
  // Live birth of one healthy baby. place: 'home' (skilled attendant) or 'health_facility'.
  delivery: ({ date, place, babyName, sex }) => [
    ['alive_well'], Array(5).fill('no'),
    ['1', '1', date, place, place === 'home' ? 'skilled' : 'vaginal'],
    ['alive_well', babyName, sex, 'yes', '2900', 'yes', '48', 'bcg_and_birth_polio', 'yes', 'yes'].concat(Array(9).fill('no')),
    [], ['within_24_hrs'], [],
  ],
  // Module 1 maternal danger assessment (maternal_danger_assessment.spec.js).
  dangerAssessment: ({ systolic = '112', diastolic = '72', temperature = '36.7', convulsions = 'no', feverReported = 'no' } = {}) => [
    ['pregnant'], [systolic, diastolic, temperature],
    [convulsions, 'no', 'no', 'no', 'no', 'no', feverReported], [],
  ],
  // Raising the referral from the task: severity is pre-filled from the assessment.
  referral: ({ severity }) => [
    [severity],
    severity === 'emergency' ? EMERGENCY_HOSPITAL : DISTRICT_FACILITY,
    ['husband', 'yes'], [],
  ],
  // Module 1 newborn home visit: mother and baby well.
  newbornVisitWell: () => [['yes', ...Array(9).fill('no'), 'yes'], Array(5).fill('no'), []],
};

const TASK = {
  RAISE_REFERRAL: 'task.referral.raise.title',
  NEWBORN_VISIT: 'task.pnc.newborn_home_visit.title',
};

// ---- people ------------------------------------------------------------------------------------

// Event helpers. `at` is a time in ms; `form` events fill a form for the woman; `task` events open
// the named task the app shows for her (as a nurse would) and fill the form it opens.
const form = (at, name, pages) => ({ at, form: name, pages });
const task = (at, title, pages) => ({ at, task: title, pages });

// A pregnancy registered `regAfterLmp` days after the last period, with home visits on the given days
// (days after registration).
// Days are chosen away from the 12-week line, where the form's own rounding decides.
// Give either `lmp`, or `regAt` (the registration time) and the LMP follows from regAfterLmp.
function pregnancyHistory(c, { lmp, regAt, regAfterLmp = 88, visitsAfterReg = [] }) {
  const reg = regAt || lmp + regAfterLmp * DAY + 10 * 3600e3;
  if (regAt) lmp = regAt - regAfterLmp * DAY - 10 * 3600e3;
  const events = [form(reg, 'pregnancy', answers.pregnancy({ lmp, at: reg, iso: c.iso }))];
  for (const d of visitsAfterReg) {
    const at = reg + d * DAY;
    events.push(form(at, 'pregnancy_home_visit', answers.pregnancyHomeVisit({ deworm: weeksBetween(lmp, at) > 12 })));
  }
  return events;
}

function deliveryAt(c, at, { place, babyName, sex }) {
  return form(at, 'delivery', answers.delivery({ date: c.iso(at), place, babyName, sex }));
}

function build({ today = new Date(), now = Date.now() } = {}) {
  const c = clock(today, now);
  const LMP_FOR_DELIVERY = at => at - 276 * DAY; // a term birth, about 39 weeks

  const district = { id: ID('district'), name: 'Kumbungu District (demo)' };
  const zones = [
    { key: 'dalun', name: 'Dalun CHPS zone (demo)',
      nurse: { key: 'abiba', name: 'Abiba Tahiru', username: 'demo_nurse_dalun', phone: '+233200000101', dob: c.yearsAgo(33) } },
    { key: 'gbullung', name: 'Gbullung CHPS zone (demo)',
      nurse: { key: 'memunatu', name: 'Memunatu Fuseini', username: 'demo_nurse_gbullung', phone: '+233200000102', dob: c.yearsAgo(29) } },
    { key: 'bontanga', name: 'Bontanga CHPS zone (demo)',
      nurse: { key: 'sakina', name: 'Sakina Iddrisu', username: 'demo_nurse_bontanga', phone: '+233200000103', dob: c.yearsAgo(38) } },
  ];

  // Households, each with the woman the story is about (and sometimes her husband).
  // `story` says, in plain words, what the presenter can show with her.
  const households = [
    // ---- Dalun: the zone the five-minute demo walks through ----
    { zone: 'dalun', key: 'abukari', name: 'Abukari household',
      woman: { key: 'fuseina', name: 'Fuseina Abukari', age: 26, lang: 'dag', other: [] },
      husband: { key: 'iddrisu', name: 'Iddrisu Abukari', age: 31 },
      story: 'Dagbani speaker, about 30 weeks pregnant, three routine visits. Use her for the live danger-sign check.',
      events: () => pregnancyHistory(c, { lmp: c.ago(210), regAfterLmp: 90, visitsAfterReg: [30, 60, 90] }) },
    { zone: 'dalun', key: 'iddrisu', name: 'Iddrisu household',
      woman: { key: 'mariama', name: 'Mariama Iddrisu', age: 21, lang: 'dag', other: ['en'] },
      story: 'Not yet registered. Register her pregnancy live.',
      events: () => [] },
    { zone: 'dalun', key: 'alhassan', name: 'Alhassan household',
      woman: { key: 'sanatu', name: 'Sanatu Alhassan', age: 29, lang: 'dag', other: ['twi'] },
      story: 'Gave birth at home yesterday. Her baby\'s first-day visit is on today\'s list.',
      events: () => {
        const birth = c.ago(1, 6);
        return [
          ...pregnancyHistory(c, { lmp: LMP_FOR_DELIVERY(birth), regAfterLmp: 80, visitsAfterReg: [40, 100, 150] }),
          deliveryAt(c, birth + 4 * 3600e3, { place: 'home', babyName: 'Baby Alhassan', sex: 'female' }),
        ];
      } },
    { zone: 'dalun', key: 'mahama', name: 'Mahama household',
      woman: { key: 'ayishetu', name: 'Ayishetu Mahama', age: 34, lang: 'dag', other: ['hau'] },
      husband: { key: 'mahama', name: 'Mahama Yakubu', age: 40 },
      story: 'Severe high blood pressure (165/112) found this morning. "Raise referral" is at the top of today\'s list.',
      events: () => [
        ...pregnancyHistory(c, { lmp: c.ago(238), regAfterLmp: 78, visitsAfterReg: [40, 100] }),
        form(c.hoursAgo(2), 'maternal_danger_assessment', answers.dangerAssessment({ systolic: '165', diastolic: '112' })),
      ] },
    { zone: 'dalun', key: 'yakubu', name: 'Yakubu household',
      woman: { key: 'rahinatu', name: 'Rahinatu Yakubu', age: 19, lang: 'dag', other: [] },
      story: 'Aged 19, registered this month (about 14 weeks).',
      events: () => pregnancyHistory(c, { regAt: c.thisMonth(6), regAfterLmp: 96 }) },
    { zone: 'dalun', key: 'sulemana', name: 'Sulemana household',
      woman: { key: 'zenabu', name: 'Zenabu Sulemana', age: 31, lang: 'dag', other: ['en'] },
      story: 'Gave birth at the health centre 20 days ago; the day-1 and day-7 newborn visits are done.',
      events: () => {
        const birth = c.ago(20, 3);
        return [
          ...pregnancyHistory(c, { lmp: LMP_FOR_DELIVERY(birth), regAfterLmp: 70, visitsAfterReg: [50, 110, 170] }),
          deliveryAt(c, birth + 5 * 3600e3, { place: 'health_facility', babyName: 'Baby Sulemana', sex: 'male' }),
          task(birth + 26 * 3600e3, TASK.NEWBORN_VISIT, answers.newbornVisitWell()),
          task(birth + 6 * DAY + 10 * 3600e3, TASK.NEWBORN_VISIT, answers.newbornVisitWell()),
        ];
      } },
    { zone: 'dalun', key: 'wumbei', name: 'Wumbei household',
      woman: { key: 'hawa', name: 'Hawa Wumbei', age: 24, lang: 'dag', other: [] },
      story: 'Fever last month (urgent); referred to Kumbungu Health Centre the same day.',
      events: () => [
        ...pregnancyHistory(c, { lmp: c.lastMonth(3) - 80 * DAY, regAfterLmp: 80 }),
        form(c.lastMonth(18, 9), 'maternal_danger_assessment', answers.dangerAssessment({ temperature: '38.6', feverReported: 'yes' })),
        task(c.lastMonth(18, 10), TASK.RAISE_REFERRAL, answers.referral({ severity: 'urgent' })),
      ] },

    // ---- Gbullung ----
    { zone: 'gbullung', key: 'yakubu', name: 'Yakubu household',
      woman: { key: 'amina', name: 'Amina Yakubu', age: 27, lang: 'dag', other: ['en'] },
      story: 'Registered last month, one home visit.',
      events: () => pregnancyHistory(c, { lmp: c.lastMonth(6) - 75 * DAY, regAfterLmp: 75, visitsAfterReg: [21] }) },
    { zone: 'gbullung', key: 'napari', name: 'Napari household',
      woman: { key: 'salamatu', name: 'Salamatu Napari', age: 30, lang: 'dag', other: [] },
      story: 'Gave birth at the health centre last month.',
      events: () => {
        const birth = c.lastMonth(14, 2);
        return [
          ...pregnancyHistory(c, { lmp: LMP_FOR_DELIVERY(birth), regAfterLmp: 85, visitsAfterReg: [60, 120] }),
          deliveryAt(c, birth + 6 * 3600e3, { place: 'health_facility', babyName: 'Baby Napari', sex: 'female' }),
          task(birth + 28 * 3600e3, TASK.NEWBORN_VISIT, answers.newbornVisitWell()),
        ];
      } },
    { zone: 'gbullung', key: 'tahiru', name: 'Tahiru household',
      woman: { key: 'rabi', name: 'Rabi Tahiru', age: 36, lang: 'dag', other: ['hau'] },
      story: 'Convulsions last month (emergency); referred to hospital in Tamale.',
      events: () => [
        ...pregnancyHistory(c, { lmp: c.lastMonth(21) - 230 * DAY, regAfterLmp: 90, visitsAfterReg: [45, 100] }),
        form(c.lastMonth(21, 7), 'maternal_danger_assessment', answers.dangerAssessment({ convulsions: 'yes' })),
        task(c.lastMonth(21, 8), TASK.RAISE_REFERRAL, answers.referral({ severity: 'emergency' })),
      ] },

    // ---- Bontanga ----
    { zone: 'bontanga', key: 'wumbei', name: 'Wumbei household',
      woman: { key: 'fati', name: 'Fati Wumbei', age: 23, lang: 'dag', other: [] },
      story: 'Registered last month.',
      events: () => pregnancyHistory(c, { lmp: c.lastMonth(9) - 70 * DAY, regAfterLmp: 70 }) },
    { zone: 'bontanga', key: 'mahama', name: 'Mahama household',
      woman: { key: 'adisa', name: 'Adisa Mahama', age: 28, lang: 'dag', other: ['en'] },
      story: 'Gave birth at home last month; first-day newborn visit done.',
      events: () => {
        const birth = c.lastMonth(25, 4);
        return [
          ...pregnancyHistory(c, { lmp: LMP_FOR_DELIVERY(birth), regAfterLmp: 95, visitsAfterReg: [70, 130] }),
          deliveryAt(c, birth + 3 * 3600e3, { place: 'home', babyName: 'Baby Mahama', sex: 'male' }),
          task(birth + 27 * 3600e3, TASK.NEWBORN_VISIT, answers.newbornVisitWell()),
        ];
      } },
    { zone: 'bontanga', key: 'abdulai', name: 'Abdulai household',
      woman: { key: 'lamisi', name: 'Lamisi Abdulai', age: 25, lang: 'dag', other: ['en'] },
      story: 'Registered last month; a danger-sign check found nothing.',
      events: () => [
        ...pregnancyHistory(c, { lmp: c.lastMonth(15) - 88 * DAY, regAfterLmp: 88 }),
        form(c.lastMonth(28, 11), 'maternal_danger_assessment', answers.dangerAssessment()),
      ] },
  ];

  // ---- contact documents ----
  const lineage = (...ids) => ids.reduceRight((parent, id) => (id ? { _id: id, ...(parent ? { parent } : {}) } : parent), undefined);
  const created = c.ago(400);
  const docs = [];
  const people = [];
  let nextPatientId = 90101;
  const person = (doc) => {
    const p = { type: 'person', reported_date: created, demo_seed: TAG, patient_id: String(nextPatientId++), ...doc };
    docs.push(p);
    return p;
  };

  docs.push({ _id: district.id, type: 'district_hospital', name: district.name, reported_date: created, demo_seed: TAG });

  const nurses = [];
  for (const z of zones) {
    z.id = ID(`zone-${z.key}`);
    const nurseId = ID(`nurse-${z.nurse.key}`);
    docs.push({ _id: z.id, type: 'health_center', name: z.name, parent: lineage(district.id),
      contact: lineage(nurseId, z.id, district.id), reported_date: created, demo_seed: TAG });
    const nurse = person({ _id: nurseId, name: z.nurse.name, sex: 'female', date_of_birth: z.nurse.dob,
      phone: z.nurse.phone, role: 'chw', parent: lineage(z.id, district.id) });
    nurses.push({ zone: z, contact: nurse, username: z.nurse.username });
  }

  const zoneById = Object.fromEntries(zones.map(z => [z.key, z]));
  const timelines = [];
  for (const h of households) {
    const z = zoneById[h.zone];
    const hhId = ID(`hh-${h.zone}-${h.key}`);
    const womanId = ID(`p-${h.zone}-${h.woman.key}`);
    docs.push({ _id: hhId, type: 'clinic', name: h.name, parent: lineage(z.id, district.id),
      contact: lineage(womanId, hhId, z.id, district.id), reported_date: created, demo_seed: TAG });
    const woman = person({ _id: womanId, name: h.woman.name, sex: 'female', date_of_birth: c.yearsAgo(h.woman.age),
      phone: `+2332000002${String(timelines.length + 1).padStart(2, '0')}`,
      preferred_language: h.woman.lang, ...(h.woman.other.length ? { other_languages: h.woman.other.join(' ') } : {}),
      parent: lineage(hhId, z.id, district.id) });
    people.push({ woman, household: h, zone: z });
    if (h.husband) {
      person({ _id: ID(`p-${h.zone}-${h.husband.key}`), name: h.husband.name, sex: 'male',
        date_of_birth: c.yearsAgo(h.husband.age), preferred_language: 'dag', parent: lineage(hhId, z.id, district.id) });
    }
    const nurse = nurses.find(n => n.zone === z).contact;
    timelines.push({ woman, nurse, household: h, events: h.events().sort((a, b) => a.at - b.at) });
  }

  return { TAG, district, zones, nurses, households, people, docs, timelines, clock: c };
}

module.exports = { build, TAG, TASK, answers };
