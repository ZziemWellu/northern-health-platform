// Module 5: the monthly (or quarterly) aggregate file the district imports into DHIS2 / DHIMS-2.
// Format: DHIS2's own CSV import layout (dataElement, period, orgUnit, categoryOptionCombo, value).
// Counts only, per facility and period: no names, phone numbers or other free text can enter it.
//
// Exact counts, including 0 to 4. This file is the district's own routine report into an
// access-controlled GHS system, and it must be able to replace the paper register: hiding small
// numbers here would under-report exactly the rare events a district most needs to see (a maternal
// death, an emergency referral). Zero is written as 0, so "none" is different from "not reported".
// Small numbers are hidden only on public outputs, with shared/public_counts.
//
// A file is "import-ready" only when every measure has a real data-element UID from the district's
// own metadata and every value is a whole, non-negative count. Anything missing or invalid is
// reported and blocks the file; nothing is guessed and nothing is dropped silently.
const PERIOD = /^(\d{6}|\d{4}Q[1-4])$/;
const UID = /^[A-Za-z][A-Za-z0-9]{10}$/;
const HEADER = 'dataElement,period,orgUnit,categoryOptionCombo,value';

function isCount(value) {
  const n = typeof value === 'string' && /^\d+$/.test(value) ? Number(value) : value;
  return Number.isInteger(n) && n >= 0 ? n : null;
}

function buildExport({ counts, mapping, period, defaultCategoryOptionCombo = '' }) {
  if (!PERIOD.test(period || '')) throw new Error('period must be yyyyMM (monthly) or yyyyQn (quarterly)');
  const rows = [];
  const report = { invalidValue: [], unmapped: [], invalidUid: [] };

  for (const [orgUnit, measures] of Object.entries(counts || {})) {
    if (!UID.test(orgUnit)) { report.invalidUid.push({ orgUnit, reason: 'organisation unit is not a DHIS2 UID' }); continue; }
    for (const [measure, value] of Object.entries(measures || {})) {
      const entry = mapping[measure];
      if (!entry || !entry.dataElement) { report.unmapped.push({ orgUnit, measure }); continue; }
      if (!UID.test(entry.dataElement)) { report.invalidUid.push({ orgUnit, measure, reason: 'data element UID missing or not a DHIS2 UID' }); continue; }
      const coc = entry.categoryOptionCombo || defaultCategoryOptionCombo;
      if (coc && !UID.test(coc)) { report.invalidUid.push({ orgUnit, measure, reason: 'category option combo is not a DHIS2 UID' }); continue; }
      const n = isCount(value);
      if (n === null) { report.invalidValue.push({ orgUnit, measure, value, reason: 'not a whole, non-negative count' }); continue; }
      rows.push({ dataElement: entry.dataElement, period, orgUnit, categoryOptionCombo: coc, value: String(n) });
    }
  }

  const csv = [HEADER, ...rows.map(r => [r.dataElement, r.period, r.orgUnit, r.categoryOptionCombo, r.value].join(','))].join('\n') + '\n';
  const importReady = rows.length > 0 &&
    report.unmapped.length === 0 && report.invalidUid.length === 0 && report.invalidValue.length === 0;
  return { csv, rows, report, importReady };
}

// Round trip check: every line in the CSV matches the header and has five fields, no free text.
function validateCsv(csv) {
  const lines = csv.trim().split('\n');
  if (lines[0] !== HEADER) return { ok: false, error: 'header does not match the DHIS2 layout' };
  for (const line of lines.slice(1)) {
    const f = line.split(',');
    if (f.length !== 5) return { ok: false, error: `line does not have five fields: ${line}` };
    if (!UID.test(f[0]) || !PERIOD.test(f[1]) || !UID.test(f[2])) return { ok: false, error: `bad UID or period: ${line}` };
    if (f[3] !== '' && !UID.test(f[3])) return { ok: false, error: `bad category option combo: ${line}` };
    if (!/^\d+$/.test(f[4])) return { ok: false, error: `value is not a whole number: ${line}` };
  }
  return { ok: true, rows: lines.length - 1 };
}

module.exports = { HEADER, buildExport, validateCsv };
