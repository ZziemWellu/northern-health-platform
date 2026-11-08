// Module 5: turns CHT reports into the counts the district file needs (export.js writes the file).
// This is the step that lets the platform replace a paper tally: the nurse's visits become the
// month's numbers without anyone counting by hand.
//
//   node shared/module5/from_cht.js --url=https://user:pass@cht-host --period=202611 \
//        --org-units=org_units.json --out=counts.json
//
// org_units.json maps a CHT place (the health centre or CHPS zone the nurse belongs to) to its DHIS2
// organisation unit UID: { "<CHT place _id>": "<DHIS2 UID>" }. A report counts for the first place
// in the submitter's hierarchy that has a UID. Reports with none are listed, never dropped quietly.
//
// MEASURES ARE DRAFTS. Each must be matched to a GHS DHIMS-2 data element and its definition
// (ECHIS_ACCESS_GUIDE.md); until then the numbers are for testing only.
const MEASURES = {
  pregnancy_registrations: { form: 'pregnancy' },
  deliveries: { form: 'delivery' },
  facility_deliveries: { form: 'delivery', field: 'delivery_outcome.delivery_place', equals: 'health_facility' },
  postnatal_home_visits: { form: 'pnc_home_visit' },
  maternal_danger_assessments: { form: 'maternal_danger_assessment' },
  maternal_danger_emergencies: { form: 'maternal_danger_assessment', field: 'r_severity', equals: 'emergency' },
  referrals_raised: { form: 'referral' },
};

const PERIOD = /^(\d{4})(?:(\d{2})|Q([1-4]))$/;

// [start, end) in milliseconds, UTC (Ghana is UTC all year).
function periodRange(period) {
  const m = PERIOD.exec(period || '');
  if (!m) throw new Error('period must be yyyyMM or yyyyQn');
  const year = Number(m[1]);
  const firstMonth = m[2] ? Number(m[2]) - 1 : (Number(m[3]) - 1) * 3;
  const months = m[2] ? 1 : 3;
  if (firstMonth < 0 || firstMonth > 11) throw new Error(`no month ${m[2]} in ${period}`);
  return [Date.UTC(year, firstMonth, 1), Date.UTC(year, firstMonth + months, 1)];
}

function field(report, dotted) {
  return dotted.split('.').reduce((v, k) => (v && typeof v === 'object' ? v[k] : undefined), report.fields);
}

function ancestors(contact) {
  const ids = [];
  for (let c = contact; c && typeof c === 'object'; c = c.parent) {
    if (c._id) ids.push(c._id);
  }
  return ids;
}

function countReports({ reports, orgUnits, period, measures = MEASURES }) {
  const [start, end] = periodRange(period);
  const counts = {};
  // Every mapped unit gets every measure, starting at 0: "none this month" is reported, not left blank.
  for (const uid of new Set(Object.values(orgUnits))) {
    counts[uid] = Object.fromEntries(Object.keys(measures).map(k => [k, 0]));
  }
  const unassigned = [];
  let counted = 0;
  for (const r of reports) {
    if (!r || r.type !== 'data_record' || !r.form) continue;
    if (!(r.reported_date >= start && r.reported_date < end)) continue;
    const hits = Object.entries(measures).filter(([, m]) =>
      m.form === r.form && (!m.field || field(r, m.field) === m.equals));
    if (!hits.length) continue;
    const place = ancestors(r.contact).find(id => Object.prototype.hasOwnProperty.call(orgUnits, id));
    if (!place) { unassigned.push({ id: r._id, form: r.form }); continue; }
    counted++;
    for (const [name] of hits) counts[orgUnits[place]][name] += 1;
  }
  return { counts, unassigned, counted };
}

// Reads the period's reports for the measured forms from the CHT's CouchDB (Mango _find, paged).
async function fetchReports({ baseUrl, auth, period, measures = MEASURES, fetchImpl = fetch, pageSize = 500 }) {
  const [start, end] = periodRange(period);
  const forms = [...new Set(Object.values(measures).map(m => m.form))];
  const reports = [];
  let bookmark;
  for (;;) {
    const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/medic/_find`, {
      method: 'POST',
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        selector: { type: 'data_record', form: { $in: forms }, reported_date: { $gte: start, $lt: end } },
        fields: ['_id', 'type', 'form', 'reported_date', 'contact', 'fields'],
        limit: pageSize,
        ...(bookmark ? { bookmark } : {}),
      }),
    });
    const body = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(`CHT _find failed: ${body.reason || body.error || res.status}`);
    reports.push(...(body.docs || []));
    if (!body.docs || body.docs.length < pageSize) break;
    bookmark = body.bookmark;
  }
  return reports;
}

module.exports = { MEASURES, periodRange, countReports, fetchReports };

if (require.main === module) {
  const fs = require('node:fs');
  const arg = n => (process.argv.find(a => a.startsWith(`--${n}=`)) || '').slice(n.length + 3) || null;
  (async () => {
    const url = new URL(arg('url'));
    const auth = 'Basic ' + Buffer.from(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`).toString('base64');
    url.username = ''; url.password = '';
    if (arg('insecure') === 'yes') process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // local test server only
    const orgUnits = JSON.parse(fs.readFileSync(arg('org-units'), 'utf8'));
    const reports = await fetchReports({ baseUrl: url.toString(), auth, period: arg('period') });
    const out = countReports({ reports, orgUnits, period: arg('period') });
    fs.writeFileSync(arg('out'), JSON.stringify(out.counts, null, 2) + '\n');
    console.log(`${out.counted} reports counted; ${out.unassigned.length} with no organisation unit`);
    if (out.unassigned.length) { console.log(JSON.stringify(out.unassigned.slice(0, 10))); process.exitCode = 1; }
  })().catch(err => { console.error(err.message); process.exitCode = 1; });
}
