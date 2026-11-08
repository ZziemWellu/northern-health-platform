const { test } = require('node:test');
const assert = require('node:assert/strict');
const { periodRange, countReports, fetchReports, MEASURES } = require('../from_cht');
const { buildExport, validateCsv } = require('../export');

const HC = 'hc-kumbungu';
const UID = 'y77LiPqLMoq';
const chw = { _id: 'chw-1', parent: { _id: 'area-1', parent: { _id: HC } } };
const at = (iso) => Date.parse(iso);
const report = (form, iso, fields = {}, contact = chw) => ({ _id: `${form}-${iso}`, type: 'data_record', form, reported_date: at(iso), contact, fields });

test('periods are calendar months or quarters', () => {
  assert.deepEqual(periodRange('202611'), [at('2026-11-01T00:00:00Z'), at('2026-12-01T00:00:00Z')]);
  assert.deepEqual(periodRange('2026Q4'), [at('2026-10-01T00:00:00Z'), at('2027-01-01T00:00:00Z')]);
  assert.throws(() => periodRange('202613'));
  assert.throws(() => periodRange('2026-11'));
});

test('reports are counted per measure for the place in the submitter\'s hierarchy', () => {
  const { counts, unassigned, counted } = countReports({
    orgUnits: { [HC]: UID },
    period: '202611',
    reports: [
      report('pregnancy', '2026-11-03T09:00:00Z'),
      report('delivery', '2026-11-05T09:00:00Z', { delivery_outcome: { delivery_place: 'health_facility' } }),
      report('delivery', '2026-11-06T09:00:00Z', { delivery_outcome: { delivery_place: 'home' } }),
      report('maternal_danger_assessment', '2026-11-07T09:00:00Z', { r_severity: 'emergency' }),
      report('maternal_danger_assessment', '2026-11-08T09:00:00Z', { r_severity: 'none' }),
      report('pregnancy', '2026-10-31T23:59:59Z'), // previous month
      report('pregnancy', '2026-12-01T00:00:00Z'), // next month
    ],
  });
  assert.deepEqual(counts[UID], {
    pregnancy_registrations: 1, deliveries: 2, facility_deliveries: 1, postnatal_home_visits: 0,
    maternal_danger_assessments: 2, maternal_danger_emergencies: 1, referrals_raised: 0,
  });
  assert.equal(counted, 5);
  assert.deepEqual(unassigned, []);
});

test('a unit with no reports still reports zeros, and a report with no unit is listed, not dropped', () => {
  const stranger = { _id: 'chw-9', parent: { _id: 'somewhere-else' } };
  const { counts, unassigned } = countReports({
    orgUnits: { [HC]: UID },
    period: '202611',
    reports: [report('pregnancy', '2026-11-03T09:00:00Z', {}, stranger)],
  });
  assert.equal(Object.values(counts[UID]).every(v => v === 0), true);
  assert.deepEqual(unassigned, [{ id: 'pregnancy-2026-11-03T09:00:00Z', form: 'pregnancy' }]);
});

test('the counts make an import-ready district file with exact small numbers and zeros', () => {
  const { counts } = countReports({ orgUnits: { [HC]: UID }, period: '202611', reports: [report('pregnancy', '2026-11-03T09:00:00Z')] });
  const mapping = Object.fromEntries(Object.keys(MEASURES).map((m, i) => [m, { dataElement: `Abcdefghij${i}` }]));
  const out = buildExport({ counts, mapping, period: '202611' });
  assert.equal(out.importReady, true);
  assert.equal(validateCsv(out.csv).ok, true);
  assert.match(out.csv, /,1\n/);
  assert.match(out.csv, /,0\n/);
});

test('fetching pages through CouchDB _find for the period and the measured forms only', async () => {
  const bodies = [];
  const pages = [[{ _id: 'a' }, { _id: 'b' }], [{ _id: 'c' }]];
  const fetchImpl = async (url, init) => {
    bodies.push({ url, body: JSON.parse(init.body) });
    const docs = pages[bodies.length - 1];
    return { ok: true, json: async () => ({ docs, bookmark: `bm${bodies.length}` }) };
  };
  const docs = await fetchReports({ baseUrl: 'https://cht.example/', auth: 'Basic x', period: '202611', fetchImpl, pageSize: 2 });
  assert.deepEqual(docs.map(d => d._id), ['a', 'b', 'c']);
  assert.equal(bodies[0].url, 'https://cht.example/medic/_find');
  assert.deepEqual(bodies[0].body.selector.reported_date, { $gte: at('2026-11-01T00:00:00Z'), $lt: at('2026-12-01T00:00:00Z') });
  assert.ok(bodies[0].body.selector.form.$in.includes('maternal_danger_assessment'));
  assert.equal(bodies[1].body.bookmark, 'bm1');
});
