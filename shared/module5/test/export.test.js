const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildExport, validateCsv, HEADER, SUPPRESS_BELOW } = require('../export');

const ORG = 'y77LiPqLMoq'; // a DHIS2 UID (example from the public demo)
const MAPPING = {
  anc_registrations: { dataElement: 'iYCGteGcr6Q' },
  deliveries: { dataElement: 'SqvCDfGBFzM' },
};

test('builds a DHIS2-layout CSV with one row per measure per facility', () => {
  const out = buildExport({ counts: { [ORG]: { anc_registrations: 42, deliveries: 9 } }, mapping: MAPPING, period: '2026Q2' });
  assert.equal(out.csv.split('\n')[0], HEADER);
  assert.equal(out.rows.length, 2);
  assert.equal(out.importReady, true);
  assert.equal(validateCsv(out.csv).ok, true);
});

test('counts below the suppression threshold are withheld, never exported', () => {
  const out = buildExport({ counts: { [ORG]: { anc_registrations: SUPPRESS_BELOW - 1 } }, mapping: MAPPING, period: '202609' });
  assert.equal(out.rows.length, 0);
  assert.match(out.report.withheld[0].reason, /withheld/);
});

test('an unmapped measure is reported and makes the file not import-ready', () => {
  const out = buildExport({ counts: { [ORG]: { anc_registrations: 20, unknown_measure: 7 } }, mapping: MAPPING, period: '202609' });
  assert.equal(out.report.unmapped.length, 1);
  assert.equal(out.importReady, false);
});

test('a placeholder UID is refused, never written to the file', () => {
  const out = buildExport({ counts: { [ORG]: { anc_registrations: 20 } }, mapping: { anc_registrations: { dataElement: 'TODO_UID' } }, period: '202609' });
  assert.equal(out.rows.length, 0);
  assert.equal(out.importReady, false);
  assert.equal(out.report.invalidUid.length, 1);
});

test('a bad period or a non-DHIS2 organisation unit is refused', () => {
  assert.throws(() => buildExport({ counts: {}, mapping: MAPPING, period: '2026-09' }));
  const out = buildExport({ counts: { 'clinic-1': { anc_registrations: 20 } }, mapping: MAPPING, period: '202609' });
  assert.equal(out.report.invalidUid.length, 1);
});

test('no names, phone numbers or free text can enter the file', () => {
  const out = buildExport({ counts: { [ORG]: { anc_registrations: 20 } }, mapping: MAPPING, period: '202609' });
  assert.doesNotMatch(out.csv, /phone|name|0244|patient/i);
});

test('the validator rejects a file with a wrong header or free text', () => {
  assert.equal(validateCsv('a,b,c\n').ok, false);
  assert.equal(validateCsv(`${HEADER}\niYCGteGcr6Q,202609,${ORG},,Mensah\n`).ok, false);
});
