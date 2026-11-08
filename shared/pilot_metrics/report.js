#!/usr/bin/env node
// Pilot evidence table from a CHT server, per nurse and in total.
//
//   node shared/pilot_metrics/report.js --url=https://user:pass@host --from=2026-12-01 --to=2027-01-12
//        [--out=pilot_measures.md] [--json=pilot_measures.json] [--insecure]
//
// --to is inclusive. The login needs read access to the reports (an admin or an analytics user).
// Names in the table come from the nurses' contact records.
const fs = require('node:fs');
const { FORMS, compute, toMarkdown } = require('./metrics');

const arg = n => (process.argv.find(a => a.startsWith(`--${n}=`)) || '').slice(n.length + 3) || null;

async function fetchJson(base, auth, path, body) {
  const res = await fetch(base + path, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: body && JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(`${path} failed: ${data.reason || data.error || res.status}`);
  return data;
}

async function main() {
  const url = new URL(arg('url') || '');
  const auth = 'Basic ' + Buffer.from(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`).toString('base64');
  const base = url.origin;
  if (process.argv.includes('--insecure')) process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0'; // local test server only
  const from = Date.parse(`${arg('from')}T00:00:00Z`);
  const to = Date.parse(`${arg('to')}T00:00:00Z`) + 864e5;
  if (!(from < to)) throw new Error('--from and --to (YYYY-MM-DD, --to inclusive) are required');

  // Newborn visits up to 2 days after the period still count for births inside it.
  const reports = [];
  let bookmark;
  for (;;) {
    const page = await fetchJson(base, auth, '/medic/_find', {
      selector: { type: 'data_record', form: { $in: FORMS }, reported_date: { $gte: from - 2 * 864e5, $lt: to + 2 * 864e5 } },
      fields: ['_id', 'type', 'form', 'reported_date', 'contact', 'fields'], limit: 500, ...(bookmark ? { bookmark } : {}),
    });
    reports.push(...page.docs);
    if (page.docs.length < 500) break;
    bookmark = page.bookmark;
  }
  const result = compute({ reports, from, to });
  const ids = Object.keys(result.nurses).filter(k => k !== 'unknown');
  const people = ids.length ? await fetchJson(base, auth, '/medic/_all_docs?include_docs=true', { keys: ids }) : { rows: [] };
  const names = Object.fromEntries(people.rows.filter(r => r.doc).map(r => [r.id, r.doc.name]));

  const md = toMarkdown(result, names);
  if (arg('out')) fs.writeFileSync(arg('out'), md);
  if (arg('json')) fs.writeFileSync(arg('json'), JSON.stringify({ ...result, names }, null, 2) + '\n');
  process.stdout.write(md);
}

main().catch(err => { console.error(err.message); process.exitCode = 1; });
