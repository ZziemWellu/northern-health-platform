const { test } = require('node:test');
const assert = require('node:assert/strict');
const { chtClient } = require('../adapters/cht');
const { mamaClient } = require('../adapters/mama');

function fakeFetch(handler) {
  const calls = [];
  const fn = async (url, init) => {
    calls.push({ url, init });
    const { status = 200, body = {} } = handler(url, init) || {};
    return { ok: status < 400, status, json: async () => body };
  };
  return { fn, calls };
}

test('CHT: creates a person under a household with Basic auth and the documented fields', async () => {
  const { fn, calls } = fakeFetch(() => ({ body: { _id: 'p1', name: 'Ama' } }));
  const cht = chtClient({ baseUrl: 'https://cht.example/', username: 'u', password: 'p', fetchImpl: fn });
  await cht.createPerson({ name: 'Ama', householdUuid: 'H-uuid' });
  assert.equal(calls[0].url, 'https://cht.example/api/v1/person');
  assert.equal(calls[0].init.method, 'POST');
  assert.equal(calls[0].init.headers.Authorization, 'Basic ' + Buffer.from('u:p').toString('base64'));
  assert.deepEqual(JSON.parse(calls[0].init.body), { name: 'Ama', type: 'person', place: 'H-uuid' });
});

test('CHT: a person without a household is refused before any request', () => {
  const { fn, calls } = fakeFetch(() => ({}));
  const cht = chtClient({ baseUrl: 'https://x', username: 'u', password: 'p', fetchImpl: fn });
  assert.throws(() => cht.createPerson({ name: 'Ama' }));
  assert.equal(calls.length, 0);
});

test('CHT: an error from the server is surfaced, not swallowed', async () => {
  const { fn } = fakeFetch(() => ({ status: 403, body: { error: 'forbidden' } }));
  const cht = chtClient({ baseUrl: 'https://x', username: 'u', password: 'p', fetchImpl: fn });
  await assert.rejects(cht.getPerson('abc'), /forbidden/);
});

test('MAMA-AI: logs in, then sends the bearer token on later calls', async () => {
  const { fn, calls } = fakeFetch((url) => (url.endsWith('/auth/login') ? { body: { access_token: 'T1' } } : { body: { id: 'x' } }));
  const mama = mamaClient({ baseUrl: 'https://m.example', phone: '0244000111', password: 'pw', fetchImpl: fn });
  await mama.login();
  await mama.createPatient({ patient_code: 'ZZ-1', facility_id: 'F' });
  assert.equal(calls[1].url, 'https://m.example/api/v1/patients/');
  assert.equal(calls[1].init.headers.Authorization, 'Bearer T1');
});

test('MAMA-AI: a refused login is an error with the server detail', async () => {
  const { fn } = fakeFetch(() => ({ status: 401, body: { detail: 'Invalid credentials' } }));
  const mama = mamaClient({ baseUrl: 'https://m.example', phone: 'x', password: 'y', fetchImpl: fn });
  await assert.rejects(mama.login(), /Invalid credentials/);
});
