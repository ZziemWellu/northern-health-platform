// Turns the demo scenario into CHT documents by filling the app's REAL forms in the CHT test harness,
// one event at a time, at the event's own date. The reports therefore carry exactly the fields the
// app writes, and tasks (raise referral, newborn visit) are opened the way a nurse opens them.
//
// SYNTHETIC DATA ONLY. Used by demo/seed.js.
const path = require('node:path');
const TestRunner = require('cht-conf-test-harness');

const APP = path.resolve(__dirname, '..');

function clone(x) { return JSON.parse(JSON.stringify(x)); }

async function generate(scenario, { log = () => {} } = {}) {
  // The harness reads the app (forms, tasks, contact summary) from the cht-app folder.
  const harness = new TestRunner({ directory: APP, harnessDataPath: path.join(APP, 'harness.defaults.json') });
  const reports = [];
  const extra = [];
  const problems = [];
  await harness.start();
  try {
    const contactsById = Object.fromEntries(scenario.docs.filter(d => d.type !== 'data_record').map(d => [d._id, d]));
    for (const t of scenario.timelines) {
      await harness.clear();
      // The woman, her household, her zone and district, and the nurse who visits her.
      const ids = new Set([t.woman._id, t.nurse._id]);
      for (const d of [t.woman, t.nurse]) for (let p = d.parent; p; p = p.parent) ids.add(p._id);
      harness.pushMockedDoc(...[...ids].map(id => clone(contactsById[id])));
      harness.user = t.nurse._id;
      harness.subject = t.woman._id;
      const nurseLineage = clone({ _id: t.nurse._id, parent: t.nurse.parent });

      for (const e of t.events) {
        await harness.setNow(e.at);
        let result;
        if (e.form) {
          result = await harness.fillForm(e.form, ...e.pages);
        } else {
          const [open] = await harness.getTasks({ title: e.task });
          if (!open) {
            problems.push(`${t.woman.name}: no "${e.task}" task on ${new Date(e.at).toISOString()}`);
            continue;
          }
          await harness.loadAction(open);
          result = await harness.fillForm(...e.pages);
        }
        const label = `${t.woman.name}: ${e.form || e.task} on ${new Date(e.at).toISOString().slice(0, 16)}`;
        if (result.errors && result.errors.length) {
          problems.push(`${label}: ${JSON.stringify(result.errors).slice(0, 300)}`);
          continue;
        }
        const report = clone(result.report);
        report.reported_date = e.at;
        // The app records the submitting nurse as the report's contact (the harness puts the subject).
        report.contact = nurseLineage;
        report.demo_seed = scenario.TAG;
        reports.push(report);
        for (const doc of result.additionalDocs || []) {
          extra.push({ ...clone(doc), reported_date: e.at, demo_seed: scenario.TAG });
        }
        log(`  ${label}${report.fields && report.fields.r_severity ? ` (${report.fields.r_severity})` : ''}`);
      }
    }
  } finally {
    await harness.stop();
  }
  return { reports, extra, problems };
}

module.exports = { generate };
