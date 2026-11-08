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

  async function raw(method, path, body) {
    const res = await fetchImpl(`${base}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    const data = await res.json().catch(() => ({}));
    return { res, data };
  }

  function fail(method, path, res, data) {
    const detail = typeof data.detail === 'string' ? data.detail : JSON.stringify(data.detail || res.status);
    const err = new Error(`MAMA-AI ${method} ${path} failed: ${detail}`);
    err.status = res.status;
    return err;
  }

  async function login() {
    token = null;
    const { res, data } = await raw('POST', '/api/v1/auth/login', { phone_number: phone, password });
    if (!res.ok) throw fail('POST', '/api/v1/auth/login', res, data);
    // A 200 without a token would leave every later call unauthenticated, failing far from the cause.
    if (!data.access_token) throw new Error('MAMA-AI login answered without an access token');
    token = data.access_token;
    return { ok: true };
  }

  // An expired token gets one fresh login and one retry; a second 401 is reported, never looped on.
  async function call(method, path, body) {
    let { res, data } = await raw(method, path, body);
    if (res.status === 401 && token) {
      await login();
      ({ res, data } = await raw(method, path, body));
    }
    if (!res.ok) throw fail(method, path, res, data);
    return data;
  }

  return {
    login,
    createPatient(fields) {
      return call('POST', '/api/v1/patients/', fields);
    },
    async getPatient(id) {
      if (!id) throw new Error('getPatient needs an id');
      return call('GET', `/api/v1/patients/${encodeURIComponent(id)}`);
    },
    recommendReferral(request) {
      return call('POST', '/api/v1/referrals/recommend', request);
    },
  };
}

module.exports = { mamaClient };
