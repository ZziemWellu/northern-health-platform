#!/usr/bin/env node
// Sends the day's reminders. Dry-run unless SMS_LIVE=1 and ARKESEL_API_KEY are both set.
//
//   node sms/run.js --input reminders.json --log sms-log.json            (dry run: prints the plan)
//   SMS_LIVE=1 ARKESEL_API_KEY=... node sms/run.js --input ... --log ... (really sends)
//
// reminders.json: [{ kind, patientId, name, patientPhone, facility, dueDate: "YYYY-MM-DD" }]
// optedOut.json (optional): ["0244..."] phone numbers that replied STOP
const fs = require('node:fs');
const { planRun } = require('./plan');
const { isLive, sendAll } = require('./gateway');

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 ? process.argv[i + 1] : fallback;
}

async function main() {
  const input = arg('input');
  const logPath = arg('log', 'sms-log.json');
  if (!input) throw new Error('Usage: node sms/run.js --input reminders.json [--log sms-log.json]');
  const reminders = JSON.parse(fs.readFileSync(input, 'utf8'));
  const optedOut = new Set(arg('optout') ? JSON.parse(fs.readFileSync(arg('optout'), 'utf8')) : []);
  const log = fs.existsSync(logPath) ? JSON.parse(fs.readFileSync(logPath, 'utf8')) : [];
  const sentKeys = new Set(log.filter(e => e.ok).map(e => e.key));
  const maxMessages = Number(process.env.SMS_MAX_PER_RUN || 200);
  const today = new Date().toISOString().slice(0, 10);

  const { send, skipped } = planRun({ reminders, sentKeys, optedOut, maxMessages, today });
  console.log(`Plan: ${send.length} to send, ${skipped.length} skipped`);
  const reasons = skipped.reduce((acc, s) => ({ ...acc, [s.reason]: (acc[s.reason] || 0) + 1 }), {});
  console.log('Skipped by reason:', reasons);

  if (!isLive()) {
    console.log('DRY RUN. Nothing was sent. Set SMS_LIVE=1 and ARKESEL_API_KEY to send.');
    send.slice(0, 5).forEach(m => console.log(`  would send to ${m.to}: ${m.text}`));
    return;
  }
  const results = await sendAll(send, {
    sender: process.env.SMS_SENDER || 'Zziem',
    apiKey: process.env.ARKESEL_API_KEY,
  });
  const failed = results.filter(r => !r.ok);
  fs.writeFileSync(logPath, JSON.stringify([...log, ...results.map(r => ({ ...r, at: new Date().toISOString() }))], null, 2));
  console.log(`Sent ${results.length - failed.length}, failed ${failed.length} (failures retry on the next run).`);
  if (failed.length) process.exitCode = 1;
}

if (require.main === module) {
  main().catch(err => { console.error(err.message); process.exitCode = 1; });
}

module.exports = { main };
