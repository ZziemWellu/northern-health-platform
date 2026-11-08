#!/usr/bin/env node
// Sends the day's reminders. Dry-run unless SMS_LIVE=1 and ARKESEL_API_KEY are both set.
//
//   node sms/run.js --input reminders.json --log sms-log.json            (dry run: prints the plan)
//   SMS_LIVE=1 ARKESEL_API_KEY=... node sms/run.js --input ... --log ... (really sends)
//
// reminders.json: [{ kind, patientId, name, patientPhone, facility, dueDate: "YYYY-MM-DD" }]
// optedOut.json (optional): ["0244...", "233244..."] numbers that replied STOP, in any common form
//
// The send log is the memory that stops a woman being texted twice, so:
//   - each result is written to the log as soon as it is known, not at the end of the run;
//   - the log is written to a temporary file and renamed, so a crash never leaves it half-written;
//   - a lock file stops two live runs from sending at the same time. If a run was killed, its lock
//     stays behind and the next run refuses to start: check the log, then delete <log>.lock.
const fs = require('node:fs');
const { planRun } = require('./plan');
const { isLive, sendAll } = require('./gateway');

function argFrom(argv, name, fallback) {
  const i = argv.indexOf(`--${name}`);
  return i >= 0 ? argv[i + 1] : fallback;
}

function readJson(file, fallback) {
  return fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : fallback;
}

function writeJsonAtomic(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2));
  fs.renameSync(tmp, file);
}

function acquireLock(lockPath) {
  try {
    fs.writeFileSync(lockPath, JSON.stringify({ pid: process.pid, at: new Date().toISOString() }), { flag: 'wx' });
  } catch (err) {
    if (err.code === 'EEXIST') {
      throw new Error(`Another run holds ${lockPath}. If no run is in progress, check the log and delete the lock.`);
    }
    throw err;
  }
  return () => fs.rmSync(lockPath, { force: true });
}

async function main({ argv = process.argv, env = process.env, fetchImpl, log: print = console.log, now = () => new Date() } = {}) {
  const input = argFrom(argv, 'input');
  const logPath = argFrom(argv, 'log', 'sms-log.json');
  if (!input) throw new Error('Usage: node sms/run.js --input reminders.json [--log sms-log.json] [--optout optedOut.json]');
  const reminders = readJson(input);
  const optoutPath = argFrom(argv, 'optout');
  const optedOut = new Set(optoutPath ? readJson(optoutPath, []) : []);
  const maxMessages = Number(env.SMS_MAX_PER_RUN || 200);
  if (!Number.isInteger(maxMessages) || maxMessages < 0) throw new Error('SMS_MAX_PER_RUN must be a whole number');
  const today = now().toISOString().slice(0, 10);

  const live = isLive(env);
  const release = live ? acquireLock(`${logPath}.lock`) : () => {};
  try {
    // Read the log only after taking the lock, so it includes everything a previous run sent.
    const log = readJson(logPath, []);
    const sentKeys = new Set(log.filter(e => e.ok).map(e => e.key));
    const { send, skipped } = planRun({ reminders, sentKeys, optedOut, maxMessages, today });
    print(`Plan: ${send.length} to send, ${skipped.length} skipped`);
    const reasons = skipped.reduce((acc, s) => ({ ...acc, [s.reason]: (acc[s.reason] || 0) + 1 }), {});
    print('Skipped by reason:', reasons);

    if (!live) {
      print('DRY RUN. Nothing was sent. Set SMS_LIVE=1 and ARKESEL_API_KEY to send.');
      send.slice(0, 5).forEach(m => print(`  would send to ${m.to}: ${m.text}`));
      return { sent: 0, failed: 0, dryRun: true, planned: send.length };
    }

    const results = await sendAll(send, {
      sender: env.SMS_SENDER || 'Zziem',
      apiKey: env.ARKESEL_API_KEY,
      fetchImpl,
      onResult: async result => {
        log.push({ ...result, at: now().toISOString() });
        writeJsonAtomic(logPath, log);
      },
    });
    const failed = results.filter(r => !r.ok);
    print(`Sent ${results.length - failed.length}, failed ${failed.length} (failures retry on the next run).`);
    return { sent: results.length - failed.length, failed: failed.length, dryRun: false };
  } finally {
    release();
  }
}

if (require.main === module) {
  main()
    .then(result => { if (result.failed) process.exitCode = 1; })
    .catch(err => { console.error(err.message); process.exitCode = 1; });
}

module.exports = { main };
