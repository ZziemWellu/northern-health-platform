// Decides which reminders go out on a run. Pure: no network, no clock, no filesystem.
// Guarantees the things that matter for a live pilot:
//   - nobody who replied STOP is texted;
//   - nobody is texted twice for the same reminder (the send log is the memory);
//   - a bad or missing phone number is reported, never silently sent to a wrong person;
//   - a run never exceeds its message cap, so a bug can't spend the whole budget.
const { toGhanaInternational } = require('./phone');
const { render } = require('./templates');

function planRun({ reminders, sentKeys = new Set(), optedOut = new Set(), maxMessages, today }) {
  const send = [];
  const skipped = [];
  for (const r of reminders) {
    const key = `${r.kind}:${r.patientId}:${r.dueDate}`;
    if (r.dueDate > today) { skipped.push({ key, reason: 'not due yet' }); continue; }
    if (sentKeys.has(key)) { skipped.push({ key, reason: 'already sent' }); continue; }
    if (optedOut.has(r.patientPhone)) { skipped.push({ key, reason: 'opted out' }); continue; }
    const to = toGhanaInternational(r.patientPhone);
    if (!to) { skipped.push({ key, reason: 'invalid phone number' }); continue; }
    if (send.length >= maxMessages) { skipped.push({ key, reason: 'run cap reached' }); continue; }
    send.push({ key, to, text: render(r.kind, { name: r.name, facility: r.facility, date: r.dueDate }) });
  }
  return { send, skipped };
}

module.exports = { planRun };
