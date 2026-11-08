// Pilot evidence from the app's own records: what the nurses did, and how fast they acted on danger
// signs. It produces the process figures the pilot reports (docs/outreach/pilot_evidence_plan.md),
// counted from the reports, never typed in by hand.
//
// These are PROCESS measures (records made, danger signs found, referrals raised, visits on time).
// They are not health outcomes, and must not be presented as lives saved or harm avoided.
const DAY = 864e5;

const FORMS = ['pregnancy', 'pregnancy_home_visit', 'maternal_danger_assessment', 'referral', 'delivery', 'pnc_home_visit'];

const f = (r, dotted) => dotted.split('.').reduce((v, k) => (v && typeof v === 'object' ? v[k] : undefined), r.fields);
const patientOf = r => f(r, 'patient_uuid') || f(r, 'patient_id') || r.patient_id || null;
const median = xs => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};
const dayStart = iso => Date.parse(`${iso}T00:00:00Z`);

function emptyRow() {
  return {
    pregnancies_registered: 0, pregnancy_home_visits: 0,
    danger_assessments: 0, danger_emergency: 0, danger_urgent: 0,
    referrals_raised: 0, referrals_from_danger_sign: 0,
    emergencies_referred: 0, emergencies_not_referred: 0, minutes_to_referral: [],
    deliveries: 0, facility_deliveries: 0, newborn_visit_by_day_1: 0, newborn_visits: 0,
  };
}

// reports: CHT data_record docs. from/to: ms, [from, to). nurseOf(report) -> a key (default: the
// submitting contact). Returns per-nurse rows and a total, plus the safety list: emergencies found
// with no referral raised (each one needs a reason, recorded in the hazard log).
function compute({ reports, from, to, nurseOf = r => (r.contact && r.contact._id) || 'unknown' }) {
  const inRange = reports.filter(r => r && r.type === 'data_record' && FORMS.includes(r.form) &&
    r.reported_date >= from && r.reported_date < to);
  const rows = {};
  const row = k => (rows[k] = rows[k] || emptyRow());
  const referralsBySource = new Map();
  const referralsByPatient = new Map();
  for (const r of inRange.filter(x => x.form === 'referral')) {
    const src = f(r, 'inputs.source_id');
    if (src) referralsBySource.set(src, r);
    const p = patientOf(r);
    if (p) referralsByPatient.set(p, [...(referralsByPatient.get(p) || []), r]);
  }
  const visitsByPatient = new Map();
  for (const r of reports.filter(x => x && x.form === 'pnc_home_visit')) {
    const p = patientOf(r);
    if (p) visitsByPatient.set(p, [...(visitsByPatient.get(p) || []), r]);
  }

  const unreferred = [];
  for (const r of inRange) {
    const n = row(nurseOf(r));
    switch (r.form) {
    case 'pregnancy': n.pregnancies_registered++; break;
    case 'pregnancy_home_visit': n.pregnancy_home_visits++; break;
    case 'maternal_danger_assessment': {
      n.danger_assessments++;
      const sev = f(r, 'r_severity');
      if (sev === 'urgent') n.danger_urgent++;
      if (sev === 'emergency') {
        n.danger_emergency++;
        // The referral raised from this assessment's task, or (if raised another way) the patient's
        // first referral within a day after it.
        const linked = referralsBySource.get(r._id) || (referralsByPatient.get(patientOf(r)) || [])
          .filter(x => x.reported_date >= r.reported_date && x.reported_date - r.reported_date <= DAY)
          .sort((a, b) => a.reported_date - b.reported_date)[0];
        if (linked) {
          n.emergencies_referred++;
          n.minutes_to_referral.push(Math.round((linked.reported_date - r.reported_date) / 60000));
        } else {
          n.emergencies_not_referred++;
          unreferred.push({ id: r._id, patient: f(r, 'patient_name') || patientOf(r), at: new Date(r.reported_date).toISOString() });
        }
      }
      break;
    }
    case 'referral': {
      n.referrals_raised++;
      if (f(r, 'inputs.source') === 'task' && f(r, 'inputs.source_id')) n.referrals_from_danger_sign++;
      break;
    }
    case 'delivery': {
      n.deliveries++;
      if (f(r, 'delivery_outcome.delivery_place') === 'health_facility') n.facility_deliveries++;
      const born = f(r, 'delivery_outcome.delivery_date');
      if (born) {
        n.newborn_visits++;
        // Day 1 = the day of birth or the next day (the national schedule's first visit).
        const limit = dayStart(born) + 2 * DAY;
        const visited = (visitsByPatient.get(patientOf(r)) || []).some(v => v.reported_date >= dayStart(born) && v.reported_date < limit);
        if (visited) n.newborn_visit_by_day_1++;
      }
      break;
    }
    default: break;
    }
  }

  const total = emptyRow();
  for (const r of Object.values(rows)) {
    for (const [k, v] of Object.entries(r)) total[k] = Array.isArray(v) ? total[k].concat(v) : total[k] + v;
  }
  const finish = r => ({
    ...r,
    minutes_to_referral: undefined,
    median_minutes_to_referral: median(r.minutes_to_referral),
    newborn_day_1_rate: r.newborn_visits ? r.newborn_visit_by_day_1 / r.newborn_visits : null,
  });
  return {
    from: new Date(from).toISOString().slice(0, 10), to: new Date(to - 1).toISOString().slice(0, 10),
    reports: inRange.length,
    nurses: Object.fromEntries(Object.entries(rows).map(([k, v]) => [k, finish(v)])),
    total: finish(total),
    emergencies_not_referred: unreferred,
  };
}

const LABELS = [
  ['pregnancies_registered', 'Pregnancies registered'],
  ['pregnancy_home_visits', 'Pregnancy home visits'],
  ['danger_assessments', 'Danger-sign checks'],
  ['danger_emergency', '... found an emergency'],
  ['danger_urgent', '... found an urgent problem'],
  ['emergencies_referred', 'Emergencies referred'],
  ['emergencies_not_referred', 'Emergencies NOT referred (review each)'],
  ['median_minutes_to_referral', 'Median minutes, emergency found to referral raised'],
  ['referrals_raised', 'Referrals raised'],
  ['deliveries', 'Births recorded'],
  ['facility_deliveries', '... in a health facility'],
  ['newborn_day_1_rate', 'Newborns visited by day 1'],
];

function toMarkdown(result, names = {}, { title = 'Pilot process measures' } = {}) {
  const keys = Object.keys(result.nurses);
  const fmt = (k, v) => {
    if (v === null || v === undefined) return 'n/a';
    if (k === 'newborn_day_1_rate') return `${Math.round(v * 100)}%`;
    return String(v);
  };
  const head = ['Measure', ...keys.map(k => names[k] || k), 'Total'];
  const lines = [
    `## ${title}: ${result.from} to ${result.to}`, '',
    `| ${head.join(' | ')} |`, `|${head.map(() => '---').join('|')}|`,
    ...LABELS.map(([k, label]) => `| ${label} | ${keys.map(n => fmt(k, result.nurses[n][k])).join(' | ')} | ${fmt(k, result.total[k])} |`),
    '',
    `${result.reports} reports counted. Process measures only: they show what was done, not health outcomes.`,
  ];
  if (result.emergencies_not_referred.length) {
    lines.push('', '**Emergencies with no referral within a day** (each needs a reason in the hazard log):', '');
    for (const e of result.emergencies_not_referred) lines.push(`- ${e.patient}, ${e.at} (report ${e.id})`);
  }
  return lines.join('\n') + '\n';
}

module.exports = { FORMS, compute, toMarkdown, median };
