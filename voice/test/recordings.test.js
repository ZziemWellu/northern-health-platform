const { test } = require('node:test');
const assert = require('node:assert/strict');
const r = require('../recordings');
const { akanTranscriber } = require('../transcribe');

const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.UTC(2026, 9, 3);

test('no recording is queued without the caregiver\'s consent', () => {
  assert.throws(() => r.queueRecording([], { id: 'a', file: 'a.amr', consent: 'no' }, NOW));
  assert.throws(() => r.queueRecording([], { id: 'a', file: 'a.amr' }, NOW));
  assert.equal(r.queueRecording([], { id: 'a', file: 'a.amr', consent: 'yes' }, NOW).length, 1);
});

test('a synced recording is deleted from the phone at once', () => {
  let q = r.queueRecording([], { id: 'a', file: 'a.amr', consent: 'yes' }, NOW);
  assert.deepEqual(r.phoneDeletions(q, NOW), []);
  q = r.markSynced(q, 'a');
  assert.deepEqual(r.phoneDeletions(q, NOW), ['a']);
});

test('an unsynced recording is deleted after the phone limit, not before', () => {
  const q = r.queueRecording([], { id: 'a', file: 'a.amr', consent: 'yes' }, NOW);
  assert.deepEqual(r.phoneDeletions(q, NOW + (r.PHONE_UNSYNCED_MAX_DAYS - 1) * DAY), []);
  assert.deepEqual(r.phoneDeletions(q, NOW + (r.PHONE_UNSYNCED_MAX_DAYS + 1) * DAY), ['a']);
});

test('server audio is deleted a set number of days after transcription, and not before', () => {
  const recs = [{ id: 'x', transcribedAt: NOW, receivedAt: NOW - DAY }];
  assert.deepEqual(r.serverDeletions(recs, NOW + DAY), []);
  assert.deepEqual(r.serverDeletions(recs, NOW + (r.SERVER_MAX_DAYS + 1) * DAY), ['x']);
});

test('audio that was never transcribed is still deleted, counted from when it arrived', () => {
  const recs = [{ id: 'failed', receivedAt: NOW }];
  assert.deepEqual(r.serverDeletions(recs, NOW + DAY), []);
  assert.deepEqual(r.serverDeletions(recs, NOW + (r.SERVER_MAX_DAYS + 1) * DAY), ['failed']);
  assert.deepEqual(r.serverDeletions([{ id: 'nodate' }], NOW), ['nodate'], 'with no date at all it is deleted, not kept');
});

test('a stored "no" for quality consent is not treated as consent', () => {
  const reviewer = { name: 'QA', role: 'quality_reviewer' };
  assert.equal(r.canListen(reviewer, { id: 'a', consentQuality: 'no' }), false);
  assert.equal(r.canListen(reviewer, { id: 'a', consentQuality: 'yes' }), false, 'only the boolean set at queueing counts');
});

test('recordings need a unique id, so syncing one never marks another', () => {
  assert.throws(() => r.queueRecording([], { file: 'a.amr', consent: 'yes' }, NOW), /needs an id/);
  const q = r.queueRecording([], { id: 'a', file: 'a.amr', consent: 'yes' }, NOW);
  assert.throws(() => r.queueRecording(q, { id: 'a', file: 'b.amr', consent: 'yes' }, NOW), /already queued/);
  assert.throws(() => r.markSynced(q, undefined), /needs a recording id/);
});

test('nobody listens by default: only a quality reviewer, and only with quality consent', () => {
  const reviewer = { name: 'QA', role: 'quality_reviewer' };
  assert.equal(r.canListen(reviewer, { id: 'a', consentQuality: false }), false);
  assert.equal(r.canListen({ name: 'CHW', role: 'chw' }, { id: 'a', consentQuality: true }), false);
  assert.equal(r.canListen(reviewer, { id: 'a', consentQuality: true }), true);
});

test('every listen is logged with who, which recording and when, never the audio', () => {
  const line = r.listenAudit({ name: 'QA', role: 'quality_reviewer' }, { id: 'a', consentQuality: true }, new Date(NOW));
  assert.deepEqual(line, { who: 'QA', recording: 'a', at: new Date(NOW).toISOString() });
});

test('the Akan transcriber passes the file and model to the runner and trims the transcript', async () => {
  let seen;
  const transcribe = akanTranscriber({
    python: 'py', script: 's.py', model: 'm',
    run: async (cmd, args) => { seen = { cmd, args }; return ' wo ho te sɛn \n'; },
  });
  assert.equal(await transcribe('/a.wav'), 'wo ho te sɛn');
  assert.deepEqual(seen, { cmd: 'py', args: ['s.py', '/a.wav', '--model', 'm'] });
});
