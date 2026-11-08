// CHT adapter for the shared household record. It talks to the CHT REST API (cht-core 5.x):
//   POST /api/v1/people        create a person under a household place (body: name, type, place)
//   GET  /api/v1/person/{uuid} read a person back
// Checked against a running CHT 5.3.1 on 8 November 2026: POST /api/v1/person (body with `parent`)
// also creates a person, but stores it as type "contact" with contact_type "person". Every app form
// here is offered only when contact.type === 'person', so such a person would never be offered the
// pilot's forms. /api/v1/people stores type "person", as the forms expect.
// Authentication is HTTP Basic, as the CHT API documents. The CHT is the source of truth for names and
// contact details. This adapter sends them there only; the household link keeps references, never names.
// The HTTP client is injected, so the adapter can be tested without a running CHT.

function chtClient({ baseUrl, username, password, fetchImpl = fetch }) {
  const base = String(baseUrl || '').replace(/\/$/, '');
  if (!base) throw new Error('baseUrl is required');
  const auth = 'Basic ' + Buffer.from(`${username}:${password}`).toString('base64');

  async function call(method, path, body) {
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers: { Authorization: auth, 'Content-Type': 'application/json' },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(`CHT ${method} ${path} failed: ${data.error || data.message || res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  return {
    // householdUuid is the CHT place (household) the person belongs to.
    // async, so a missing field is a rejected promise like any other failure, never a synchronous throw.
    async createPerson({ name, householdUuid, type = 'person' }) {
      if (!name || !householdUuid) throw new Error('a person needs a name and a household');
      const data = await call('POST', '/api/v1/people', { name, type, place: householdUuid });
      return { _id: data.id, rev: data.rev };
    },
    async getPerson(uuid) {
      if (!uuid) throw new Error('getPerson needs a uuid');
      return call('GET', `/api/v1/person/${encodeURIComponent(uuid)}`);
    },
  };
}

module.exports = { chtClient };
