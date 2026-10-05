// MAMA-AI adapter for the shared household record. It talks to the MAMA-AI API over HTTP and maps its
// patient codes to platform person IDs (see household_link.js). The HTTP client is injected, so the
// adapter can be tested without a network and pointed at a local or a hosted instance.
//
// Endpoints used (services/api-gateway/app): POST /api/v1/auth/login, POST /api/v1/patients/,
// GET /api/v1/patients/{id}, POST /api/v1/referrals/recommend.

function mamaClient({ baseUrl, phone, password, fetchImpl = fetch }) {
  const base = String(baseUrl || '').replace(/\/$/, '');
  if (!base) throw new Error('baseUrl is required');
  let token = null;

  async function call(method, path, body) {
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) {
      const err = new Error(`MAMA-AI ${method} ${path} failed: ${data.detail || res.status}`);
      err.status = res.status;
      throw err;
    }
    return data;
  }

  return {
    async login() {
      const data = await call('POST', '/api/v1/auth/login', { phone_number: phone, password });
      token = data.access_token;
      return { ok: true };
    },
    createPatient(fields) {
      return call('POST', '/api/v1/patients/', fields);
    },
    getPatient(id) {
      return call('GET', `/api/v1/patients/${encodeURIComponent(id)}`);
    },
    recommendReferral(request) {
      return call('POST', '/api/v1/referrals/recommend', request);
    },
  };
}

module.exports = { mamaClient };
