// Aggregate export to DHIS2, the reporting system that sits behind Ghana's community health data.
// Sends COUNTS per facility and period, never individual records. Counts below SUPPRESS_BELOW are
// withheld, so a small village cannot be identified from a number on a dashboard.
//
// Data element UIDs are local configuration: they come from the district's DHIS2 metadata, not from
// this code. Until they are filled in (config/dhis2.json), the export only builds a payload and does
// not send anything. Live push also needs DHIS2_URL, DHIS2_USER and DHIS2_PASSWORD (or a token).
const SUPPRESS_BELOW = 5;

function buildDataValues({ counts, mapping, orgUnit, period }) {
  const values = [];
  const suppressed = [];
  for (const [measure, value] of Object.entries(counts)) {
    const dataElement = mapping[measure];
    if (!dataElement) { suppressed.push({ measure, reason: 'no data element mapped' }); continue; }
    if (value < SUPPRESS_BELOW) { suppressed.push({ measure, reason: `below ${SUPPRESS_BELOW}, withheld` }); continue; }
    values.push({ dataElement, period, orgUnit, value: String(value) });
  }
  return { payload: { dataValues: values }, suppressed };
}

function isLive(env = process.env, mapping = {}) {
  const configured = Object.values(mapping).every(v => v && !String(v).startsWith('TODO'));
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

module.exports = { SUPPRESS_BELOW, buildDataValues, isLive, pushDataValues };
