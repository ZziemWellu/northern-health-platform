#!/usr/bin/env node
// Loads the demo district (demo/scenario.js) into a CHT server: SYNTHETIC DATA ONLY.
//
//   npm run demo-seed -- --url=https://medic:<admin password>@host[:port] [options]
//
// Options
//   --nurse-password=...   password for the three demo nurse logins (or env NHP_DEMO_NURSE_PASSWORD).
//                          Required unless --reset-only. At least 8 characters, letters and digits.
//   --remove-legacy        also delete the old test data: "Demo District" and the "E2E ..." district,
//                          everything under them, their reports, and the e2e_chw login.
//   --reset-only           delete the demo (and, with --remove-legacy, the old test data) and stop.
//   --dry-run              show what would be deleted and created; change nothing.
//   --insecure             accept a self-signed certificate (the local Docker test server only).
//   --out=DIR              where to write last month's Module 5 file (default cht-app/.demo-out).
//
// Safety
//   It refuses to run on a server that holds people it did not create (anything outside the demo
//   and the old test districts), so it cannot be pointed at a real district's server by mistake.
//   Every document it writes carries demo_seed: "nhp-demo-kumbungu-v1", and a re-run first deletes
//   the previous demo, so it can be run as often as needed (for example on the morning of a demo).
const fs = require('node:fs');
const path = require('node:path');
const scenario = require('./scenario');
const { generate } = require('./generate');
const m5 = require('../../shared/module5/from_cht');
const { buildExport, validateCsv } = require('../../shared/module5/export');

const APP = path.resolve(__dirname, '..');
const DEMO_M5 = path.resolve(APP, '..', 'docs', 'pitch', 'demo_module5');
const LEGACY_ROOT = d => isPlace(d) && placeType(d) === 'district_hospital' && (d.name === 'Demo District' || /^E2E /.test(d.name || ''));
const DEMO_USER = /^demo_nurse_/;
const LEGACY_USER = /^e2e_/;

const PLACE_TYPES = ['district_hospital', 'health_center', 'clinic'];
const placeType = d => (d.type === 'contact' ? d.contact_type : d.type);
const isPlace = d => PLACE_TYPES.includes(placeType(d));
const isContact = d => isPlace(d) || placeType(d) === 'person';
const chain = lineage => { const ids = []; for (let p = lineage; p && typeof p === 'object'; p = p.parent) if (p._id) ids.push(p._id); return ids; };

function args(argv) {
  const a = Object.fromEntries(argv.filter(x => x.startsWith('--')).map(x => {
    const [k, ...v] = x.slice(2).split('=');
    return [k, v.length ? v.join('=') : true];
  }));
  if (!a.url) throw new Error('--url=https://medic:<password>@host is required');
  const url = new URL(a.url);
  const auth = 'Basic ' + Buffer.from(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`).toString('base64');
  url.username = ''; url.password = '';
  const nursePassword = a['nurse-password'] || process.env.NHP_DEMO_NURSE_PASSWORD;
  if (!a['reset-only'] && !a['dry-run']) {
    if (!nursePassword) throw new Error('--nurse-password (or NHP_DEMO_NURSE_PASSWORD) is required');
    if (nursePassword.length < 8 || !/[a-z]/i.test(nursePassword) || !/\d/.test(nursePassword)) {
      throw new Error('the nurse password needs at least 8 characters, with letters and digits');
    }
  }
  return {
    base: url.origin, auth, nursePassword,
    removeLegacy: !!a['remove-legacy'], resetOnly: !!a['reset-only'], dryRun: !!a['dry-run'],
    insecure: !!a.insecure, out: path.resolve(a.out || path.join(APP, '.demo-out')),
  };
}

function client({ base, auth }) {
  return async (method, p, body) => {
    const res = await fetch(base + p, {
      method, redirect: 'manual',
      headers: { Authorization: auth, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    let data; try { data = JSON.parse(text); } catch { data = text; }
    return { status: res.status, data, headers: res.headers };
  };
}

async function allDocs(api) {
  const docs = [];
  let startkey;
  for (;;) {
    const q = `/medic/_all_docs?include_docs=true&limit=1000${startkey ? `&skip=1&startkey=${encodeURIComponent(JSON.stringify(startkey))}` : ''}`;
    const { status, data } = await api('GET', q);
    if (status !== 200) throw new Error(`reading the database failed (${status})`);
    const rows = data.rows || [];
    docs.push(...rows.map(r => r.doc).filter(d => d && !d._id.startsWith('_design/')));
    if (rows.length < 1000) return docs;
    startkey = rows[rows.length - 1].id;
  }
}

async function listUsers(api) {
  const { status, data } = await api('GET', '/api/v1/users');
  if (status !== 200 || !Array.isArray(data)) throw new Error(`listing users failed (${status})`);
  return data;
}

// What to delete: the previous demo, and (if asked) the old test districts with everything that
// hangs off them. Also returns the people it would NOT touch, for the safety check.
function plan(docs, users, { removeLegacy }) {
  const legacyRoots = new Set(docs.filter(LEGACY_ROOT).map(d => d._id));
  const inLegacy = d => [d._id, ...chain(d.parent)].some(id => legacyRoots.has(id));
  const contacts = docs.filter(isContact);
  const doomedContacts = new Set(contacts.filter(d => d.demo_seed === scenario.TAG || (removeLegacy && inLegacy(d))).map(d => d._id));
  const doomedPatientIds = new Set(contacts.filter(d => doomedContacts.has(d._id) && d.patient_id).map(d => d.patient_id));
  const reportAbout = d => d.type === 'data_record' && (
    d.demo_seed === scenario.TAG ||
    chain(d.contact).some(id => doomedContacts.has(id)) ||
    (d.fields && (doomedContacts.has(d.fields.patient_uuid) || doomedPatientIds.has(d.fields.patient_id))) ||
    doomedPatientIds.has(d.patient_id));
  const derived = d => (d.type === 'task' && (doomedContacts.has(d.owner) || doomedContacts.has(d.requester))) ||
    (d.type === 'target' && doomedContacts.has(d.owner));
  const doomed = docs.filter(d => d.type !== 'user-settings' &&
    (doomedContacts.has(d._id) || reportAbout(d) || derived(d) || d.demo_seed === scenario.TAG));
  // Demo logins are updated, not deleted (createNurses). Old test logins are deleted with their data.
  const doomedUsers = users.filter(u => !DEMO_USER.test(u.username) && removeLegacy &&
    (LEGACY_USER.test(u.username) || (u.place && [].concat(u.place).some(p => p && doomedContacts.has(p._id)))));
  // Anyone else on the server is not ours to touch, and means this is not a demo-only server.
  const others = contacts.filter(d => !doomedContacts.has(d._id) && !(placeType(d) === 'person' && !d.parent) &&
    d.demo_seed !== scenario.TAG && !inLegacy(d));
  return { doomed, doomedUsers, others, legacyRoots: docs.filter(LEGACY_ROOT) };
}

async function removeAll(api, { doomed, doomedUsers }) {
  for (const u of doomedUsers) {
    const r = await api('DELETE', `/api/v1/users/${encodeURIComponent(u.username)}`);
    if (r.status >= 300) throw new Error(`deleting user ${u.username} failed (${r.status}): ${JSON.stringify(r.data)}`);
  }
  // CHT's Sentinel may update a document between our read and the delete; such conflicts are
  // retried with the current revision.
  let pending = doomed.map(d => ({ _id: d._id, _rev: d._rev }));
  for (let attempt = 1; pending.length; attempt++) {
    const conflicts = [];
    for (let i = 0; i < pending.length; i += 500) {
      const batch = pending.slice(i, i + 500).map(d => ({ ...d, _deleted: true }));
      const r = await api('POST', '/medic/_bulk_docs', { docs: batch });
      if (r.status >= 300 || !Array.isArray(r.data)) throw new Error(`deleting documents failed (${r.status}): ${JSON.stringify(r.data)}`);
      const failed = r.data.filter(x => x.error);
      const other = failed.filter(x => x.error !== 'conflict');
      if (other.length) throw new Error(`deleting documents failed: ${JSON.stringify(other.slice(0, 3))}`);
      conflicts.push(...failed.map(x => x.id));
    }
    if (!conflicts.length) return;
    if (attempt === 5) throw new Error(`could not delete ${conflicts.length} document(s) after 5 attempts: ${conflicts.slice(0, 3).join(', ')}`);
    const fresh = await api('POST', '/medic/_all_docs', { keys: conflicts });
    pending = (fresh.data.rows || []).filter(row => row.value && !row.value.deleted).map(row => ({ _id: row.id, _rev: row.value.rev }));
  }
}

async function insert(api, docs) {
  for (let i = 0; i < docs.length; i += 200) {
    const r = await api('POST', '/medic/_bulk_docs', { docs: docs.slice(i, i + 200) });
    const failed = (Array.isArray(r.data) ? r.data : []).filter(x => x.error);
    if (r.status >= 300 || failed.length) throw new Error(`writing documents failed: ${JSON.stringify(failed.slice(0, 3).length ? failed.slice(0, 3) : r.data)}`);
  }
}

// The demo logins are kept across re-runs and updated in place: CHT never frees a deleted username
// (it keeps an inactive user-settings record). A demo login left soft-deleted by an earlier run is
// cleared first, since only the demo's own logins are touched here.
async function createNurses(api, s, password) {
  for (const n of s.nurses) {
    const body = {
      password, roles: ['chw'], place: n.zone.id, contact: n.contact._id,
      fullname: n.contact.name, phone: n.contact.phone, password_change_required: false,
    };
    const id = `org.couchdb.user:${n.username}`;
    const existing = await api('GET', `/_users/${encodeURIComponent(id)}`);
    let r;
    if (existing.status === 200) {
      r = await api('POST', `/api/v1/users/${encodeURIComponent(n.username)}`, body);
    } else {
      const settings = await api('GET', `/medic/${encodeURIComponent(id)}`);
      if (settings.status === 200 && settings.data.inactive) {
        await api('DELETE', `/medic/${encodeURIComponent(id)}?rev=${settings.data._rev}`);
      }
      r = await api('POST', '/api/v1/users', { username: n.username, ...body });
    }
    if (r.status >= 300) throw new Error(`setting up ${n.username} failed (${r.status}): ${JSON.stringify(r.data)}`);
  }
}

// Logs in the way the app's login page does. A redirect to the password-reset page means the
// nurse would be asked to change the password first.
async function checkLogin(base, username, password) {
  const res = await fetch(`${base}/medic/login`, {
    method: 'POST', redirect: 'manual',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ user: username, password }),
  });
  const text = await res.text().catch(() => '');
  if (res.status === 302 || res.status === 200) {
    const where = res.headers.get('location') || text;
    return /password-reset/.test(where) ? 'asks for a new password first' : 'ok';
  }
  return `failed (${res.status})`;
}

// Last month's Module 5 file from what is now on the server, with demo identifiers.
async function module5(api, { base, auth, out }, s) {
  const today = new Date();
  const period = `${new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth() - 1, 1)).toISOString().slice(0, 7).replace('-', '')}`;
  const orgUnitsByZone = JSON.parse(fs.readFileSync(path.join(DEMO_M5, 'org_units.json'), 'utf8'));
  const orgUnits = Object.fromEntries(s.zones.map(z => [z.id, orgUnitsByZone[z.key]]));
  const mapping = JSON.parse(fs.readFileSync(path.join(DEMO_M5, 'mapping.json'), 'utf8'));
  const reports = await m5.fetchReports({ baseUrl: base, auth, period });
  const counted = m5.countReports({ reports, orgUnits, period });
  const built = buildExport({ counts: counted.counts, mapping, period });
  const check = validateCsv(built.csv);
  fs.mkdirSync(out, { recursive: true });
  const file = path.join(out, `module5_${period}_DEMO.csv`);
  if (built.importReady && check.ok) fs.writeFileSync(file, built.csv);
  return { period, counts: counted.counts, unassigned: counted.unassigned, file: built.importReady && check.ok ? file : null, orgUnitsByZone };
}

async function main() {
  const o = args(process.argv.slice(2));
  if (o.insecure) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';
  const api = client(o);
  const log = (...x) => console.log(...x);

  const session = await api('GET', '/_session');
  const roles = (session.data && session.data.userCtx && session.data.userCtx.roles) || [];
  if (session.status !== 200 || !roles.includes('_admin')) throw new Error(`the --url login is not a CHT admin (status ${session.status})`);

  log(`Server: ${o.base}`);
  const p = plan(await allDocs(api), await listUsers(api), o);
  if (p.others.length) {
    log(`\nREFUSING: this server holds ${p.others.length} contact(s) that are not demo or old test data, e.g.`);
    for (const d of p.others.slice(0, 5)) log(`  - ${placeType(d)}: ${d.name} (${d._id})`);
    log('Demo data goes only on a demo server. Nothing was changed.');
    process.exitCode = 2;
    return;
  }
  log(`To delete: ${p.doomed.length} document(s), ${p.doomedUsers.length} login(s)` +
    (o.removeLegacy ? ` (old test districts: ${p.legacyRoots.map(d => d.name).join(', ') || 'none'})` : ''));
  if (!o.removeLegacy && p.legacyRoots.length) {
    log(`Note: old test districts are still on the server (${p.legacyRoots.map(d => d.name).join(', ')}); add --remove-legacy to delete them.`);
  }

  const s = scenario.build();
  if (o.dryRun) {
    log(`Would create: ${s.docs.length} contacts and people, ${s.nurses.length} nurse logins, and the reports for ${s.timelines.length} women.`);
    for (const d of p.doomedUsers) log(`  would delete login ${d.username}`);
    return;
  }
  if (o.resetOnly) {
    await removeAll(api, p);
    log('Deleted.');
    return;
  }

  // Fill every form first: if any fails, the server is left exactly as it was.
  log('Filling the forms for each woman (CHT test harness, about a minute)...');
  const gen = await generate(s, { log: () => {} });
  if (gen.problems.length) {
    throw new Error(`some forms could not be filled; nothing was changed:\n  ${gen.problems.join('\n  ')}`);
  }
  // Read again: the server may have changed during the minute of form filling.
  const now = plan(await allDocs(api), await listUsers(api), o);
  if (now.others.length) throw new Error('people who are not demo data appeared on the server while preparing; nothing was changed');
  await removeAll(api, now);
  log('Deleted the previous data.');
  await insert(api, [...s.docs, ...gen.extra, ...gen.reports]);
  await createNurses(api, s, o.nursePassword);
  log(`Created: ${s.docs.length} contacts and people, ${gen.extra.length} newborns, ${gen.reports.length} reports, ${s.nurses.length} nurse logins.`);

  log('\nChecks');
  for (const n of s.nurses) log(`  login ${n.username}: ${await checkLogin(o.base, n.username, o.nursePassword)}`);
  const m = await module5(api, o, s);
  log(`  Module 5, ${m.period} (last month), counts per CHPS zone:`);
  for (const z of s.zones) log(`    ${z.name.padEnd(28)} ${JSON.stringify(m.counts[m.orgUnitsByZone[z.key]])}`);
  if (m.unassigned.length) log(`    ${m.unassigned.length} report(s) with no organisation unit`);
  log(m.file ? `  Module 5 file: ${m.file}` : '  Module 5 file: not import-ready (see mapping)');

  log('\nThe demo story (log in as demo_nurse_dalun):');
  for (const h of s.households.filter(x => x.zone === 'dalun')) log(`  - ${h.woman.name}: ${h.story}`);
}

if (require.main === module) {
  main().catch(err => { console.error(`\nFAILED: ${err.message}`); process.exitCode = 1; });
}

module.exports = { plan, args };
