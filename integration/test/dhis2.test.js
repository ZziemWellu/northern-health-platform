const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SUPPRESS_BELOW, buildDataValues, isLive, pushDataValues } = require('../dhis2');

const mapping = { pregnancies: 'UID_PREG', referrals_completed: 'UID_REF', barriers_found: 'UID_BAR' };

test('builds one data value per measure, for the given facility and period', () => {
  const { payload, suppressed } = buildDataValues({
    counts: { pregnancies: 42, referrals_completed: 17, barriers_found: 9 },
    mapping, orgUnit: 'ORG1', period: '202610',
  });
  assert.equal(suppressed.length, 0);
  assert.deepEqual(payload.dataValues, [
    { dataElement: 'UID_PREG', period: '202610', orgUnit: 'ORG1', value: '42' },
    { dataElement: 'UID_REF', period: '202610', orgUnit: 'ORG1', value: '17' },
    { dataElement: 'UID_BAR', period: '202610', orgUnit: 'ORG1', value: '9' },
  ]);
});

test('withholds small counts so a village cannot be identified from a dashboard', () => {
  const { payload, suppressed } = buildDataValues({
    counts: { pregnancies: SUPPRESS_BELOW - 1 }, mapping, orgUnit: 'ORG1', period: '202610',
  });
  assert.equal(payload.dataValues.length, 0);
  assert.match(suppressed[0].reason, /withheld/);
});

test('an unmapped measure is reported, never guessed at', () => {
  const { payload, suppressed } = buildDataValues({
    counts: { something_new: 50 }, mapping, orgUnit: 'ORG1', period: '202610',
  });
  assert.equal(payload.dataValues.length, 0);
  assert.equal(suppressed[0].reason, 'no data element mapped');
});

test('the payload carries counts only, never names, phones or ids of people', () => {
  const { payload } = buildDataValues({ counts: { pregnancies: 42 }, mapping, orgUnit: 'ORG1', period: '202610' });
  const text = JSON.stringify(payload);
  assert.doesNotMatch(text, /phone|name|patient|0244/i);
});

test('live only when switched on, configured, and not left as TODO placeholders', () => {
  assert.equal(isLive({ DHIS2_LIVE: '1', DHIS2_URL: 'https://x' }, { a: 'TODO_UID' }), false);
  assert.equal(isLive({ DHIS2_URL: 'https://x' }, { a: 'Abc123' }), false);
  assert.equal(isLive({ DHIS2_LIVE: '1', DHIS2_URL: 'https://x' }, { a: 'Abc123' }), true);
});

test('posts to the documented dataValueSets endpoint with the given auth header', async () => {
  let seen;
  const fakeFetch = async (url, init) => {
    seen = { url, init };
    return { ok: true, status: 200, json: async () => ({ importCount: { imported: 2 } }) };
  };
  const res = await pushDataValues({ payload: { dataValues: [] }, baseUrl: 'https://dhis.example/', auth: 'Basic abc', fetchImpl: fakeFetch });
  assert.equal(res.ok, true);
  assert.equal(seen.url, 'https://dhis.example/api/dataValueSets');
  assert.equal(seen.init.headers.Authorization, 'Basic abc');
});

test('a rejected push is reported with the server message, not swallowed', async () => {
  const fakeFetch = async () => ({ ok: false, status: 409, json: async () => ({ message: 'Conflict' }) });
  const res = await pushDataValues({ payload: {}, baseUrl: 'https://x', auth: 'a', fetchImpl: fakeFetch });
  assert.deepEqual(res, { ok: false, status: 409, error: 'Conflict' });
});
