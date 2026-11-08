// Aggregate export to DHIS2, the reporting system that sits behind Ghana's community health data.
// Sends COUNTS per facility and period, never individual records.
//
// Exact counts, including 0 to 4: this is the district's own reporting into an access-controlled GHS
// system, where small numbers matter most (rare, serious events). Small numbers are hidden only on
// public outputs, with shared/public_counts. Zero is sent as 0, so "none" differs from "not reported".
//
// Data element UIDs are local configuration: they come from the district's DHIS2 metadata, not from
// this code. Until they are filled in (config/dhis2.json), the export only builds a payload and does
// not send anything. Live push also needs DHIS2_URL, DHIS2_USER and DHIS2_PASSWORD (or a token).

function buildDataValues({ counts, mapping, orgUnit, period }) {
  const values = [];
  const problems = [];
  for (const [measure, value] of Object.entries(counts || {})) {
    const dataElement = mapping[measure];
    if (!dataElement) { problems.push({ measure, reason: 'no data element mapped' }); continue; }
    if (!Number.isInteger(value) || value < 0) {
      problems.push({ measure, value, reason: 'not a whole, non-negative count' });
      continue;
    }
    values.push({ dataElement, period, orgUnit, value: String(value) });
  }
  // A payload with problems is not complete: callers must not push it as the period's report.
  return { payload: { dataValues: values }, problems, complete: problems.length === 0 };
}

function isLive(env = process.env, mapping = {}) {
  const entries = Object.values(mapping);
  const configured = entries.length > 0 && entries.every(v => v && !String(v).startsWith('TODO'));
  return env.DHIS2_LIVE === '1' && !!env.DHIS2_URL && configured;
}

async function pushDataValues({ payload, baseUrl, auth, fetchImpl = fetch }) {
  const res = await fetchImpl(`${baseUrl.replace(/\/$/, '')}/api/dataValueSets`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) return { ok: false, status: res.status, error: body.message || `HTTP ${res.status}` };
  return { ok: true, imported: body.importCount || null };
}

module.exports = { buildDataValues, isLive, pushDataValues };
