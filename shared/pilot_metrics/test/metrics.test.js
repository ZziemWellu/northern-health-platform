const test = require('node:test');
const assert = require('node:assert');
const { compute, toMarkdown, median } = require('../metrics');

const H = 3600e3;
const T0 = Date.parse('2026-12-01T00:00:00Z');
const nurseA = { _id: 'nurse-a', parent: { _id: 'zone-a' } };
const nurseB = { _id: 'nurse-b', parent: { _id: 'zone-b' } };
let n = 0;
const rep = (form, at, contact, fields = {}) => ({ _id: `r${++n}`, type: 'data_record', form, reported_date: at, contact, fields });

test('counts records per nurse and in total, inside the period only', () => {
  const reports = [
    rep('pregnancy', T0 + H, nurseA, { patient_uuid: 'w1' }),
    rep('pregnancy', T0 + 2 * H, nurseB, { patient_uuid: 'w2' }),
    rep('pregnancy_home_visit', T0 + 3 * H, nurseA, { patient_uuid: 'w1' }),
    rep('pregnancy', T0 - H, nurseA, { patient_uuid: 'w3' }), // before the period
    rep('pregnancy', T0 + 40 * 864e5, nurseA, { patient_uuid: 'w4' }), // after
  ];
  const r = compute({ reports, from: T0, to: T0 + 30 * 864e5 });
  assert.equal(r.nurses['nurse-a'].pregnancies_registered, 1);
  assert.equal(r.nurses['nurse-b'].pregnancies_registered, 1);
  assert.equal(r.total.pregnancies_registered, 2);
  assert.equal(r.total.pregnancy_home_visits, 1);
  assert.equal(r.reports, 3);
});

test('an emergency is matched to the referral raised from its task, and the delay is measured', () => {
  const a = rep('maternal_danger_assessment', T0 + 10 * H, nurseA, { patient_uuid: 'w1', r_severity: 'emergency' });
  const ref = rep('referral', T0 + 10 * H + 12 * 60000, nurseA, { patient_uuid: 'w1', inputs: { source: 'task', source_id: a._id } });
  const r = compute({ reports: [a, ref], from: T0, to: T0 + 864e5 });
  assert.equal(r.total.danger_emergency, 1);
  assert.equal(r.total.emergencies_referred, 1);
  assert.equal(r.total.emergencies_not_referred, 0);
  assert.equal(r.total.median_minutes_to_referral, 12);
  assert.equal(r.total.referrals_from_danger_sign, 1);
});

test('an emergency with no referral within a day is listed for review', () => {
  const a = rep('maternal_danger_assessment', T0 + H, nurseB, { patient_uuid: 'w9', patient_name: 'Test Woman', r_severity: 'emergency' });
  const late = rep('referral', T0 + H + 2 * 864e5, nurseB, { patient_uuid: 'w9' });
  const r = compute({ reports: [a, late], from: T0, to: T0 + 5 * 864e5 });
  assert.equal(r.total.emergencies_not_referred, 1);
  assert.equal(r.emergencies_not_referred[0].patient, 'Test Woman');
  assert.match(toMarkdown(r), /Emergencies with no referral within a day/);
});

test('a referral raised another way, within a day of the emergency, still counts as referred', () => {
  const a = rep('maternal_danger_assessment', T0 + H, nurseA, { patient_uuid: 'w5', r_severity: 'emergency' });
  const ref = rep('referral', T0 + 3 * H, nurseA, { patient_uuid: 'w5', inputs: { source: 'action' } });
  const r = compute({ reports: [a, ref], from: T0, to: T0 + 864e5 });
  assert.equal(r.total.emergencies_referred, 1);
  assert.equal(r.total.median_minutes_to_referral, 120);
});

test('urgent and no-danger checks are counted but not treated as emergencies', () => {
  const reports = [
    rep('maternal_danger_assessment', T0 + H, nurseA, { r_severity: 'urgent' }),
    rep('maternal_danger_assessment', T0 + 2 * H, nurseA, { r_severity: 'none' }),
  ];
  const r = compute({ reports, from: T0, to: T0 + 864e5 });
  assert.equal(r.total.danger_assessments, 2);
  assert.equal(r.total.danger_urgent, 1);
  assert.equal(r.total.danger_emergency, 0);
  assert.equal(r.total.median_minutes_to_referral, null);
});

test('newborn day-1 visits: the birth day or the next day counts; later does not', () => {
  const born = '2026-12-03';
  const birthDay = Date.parse(`${born}T00:00:00Z`);
  const reports = [
    rep('delivery', birthDay + 8 * H, nurseA, { patient_uuid: 'm1', delivery_outcome: { delivery_date: born, delivery_place: 'home' } }),
    rep('pnc_home_visit', birthDay + 30 * H, nurseA, { patient_uuid: 'm1' }), // next day: on time
    rep('delivery', birthDay + 9 * H, nurseB, { patient_uuid: 'm2', delivery_outcome: { delivery_date: born, delivery_place: 'health_facility' } }),
    rep('pnc_home_visit', birthDay + 60 * H, nurseB, { patient_uuid: 'm2' }), // day 3: late
  ];
  const r = compute({ reports, from: T0, to: T0 + 30 * 864e5 });
  assert.equal(r.total.deliveries, 2);
  assert.equal(r.total.facility_deliveries, 1);
  assert.equal(r.total.newborn_visit_by_day_1, 1);
  assert.equal(r.total.newborn_day_1_rate, 0.5);
  assert.match(toMarkdown(r), /\| Newborns visited by day 1 \| 100% \| 0% \| 50% \|/);
});

test('median', () => {
  assert.equal(median([]), null);
  assert.equal(median([5]), 5);
  assert.equal(median([9, 1, 5]), 5);
  assert.equal(median([1, 2, 3, 10]), 2.5);
});
