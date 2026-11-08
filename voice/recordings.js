// Rules for caregiver question recordings: when they may be kept, when they are deleted, and who may
// listen. Pure functions, so the same rules run on the CHW's phone and on the server, and are tested.
//
// Decisions (proposed by the developer; the reviewer and the district data officer must confirm them):
//   - No recording without the caregiver's consent (the form's first question).
//   - On the phone: a recording is deleted as soon as the server confirms it, and never kept longer
//     than PHONE_UNSYNCED_MAX_DAYS, so a phone that never syncs does not hold voices for ever.
//   - On the server: audio is deleted SERVER_MAX_DAYS after it is transcribed. Only the topic (intent)
//     is kept, never the words, as in respond.js.
//   - Nobody listens by default. A person may listen only for a quality check, only when the caregiver
//     also agreed to quality checks, and only if they hold the quality_reviewer role. Each listen is logged.
const DAY = 24 * 60 * 60 * 1000;
const PHONE_UNSYNCED_MAX_DAYS = 14;
const SERVER_MAX_DAYS = 7;

function queueRecording(queue, item, now = Date.now()) {
  if (!item || item.consent !== 'yes') throw new Error('no recording without the caregiver\'s consent');
  if (!item.file) throw new Error('a recording needs a file');
  // Without a unique id, markSynced could mark (and so delete) the wrong recording.
  if (!item.id) throw new Error('a recording needs an id');
  if (queue.some(r => r.id === item.id)) throw new Error(`a recording with id ${item.id} is already queued`);
  return [...queue, { id: item.id, file: item.file, consentQuality: item.consentQuality === 'yes', createdAt: now, synced: false }];
}

function markSynced(queue, id) {
  if (!id) throw new Error('markSynced needs a recording id');
  return queue.map(r => (r.id === id ? { ...r, synced: true } : r));
}

// Returns which phone recordings to delete now. Synced ones go at once; unsynced ones after the limit.
function phoneDeletions(queue, now = Date.now()) {
  return queue
    .filter(r => r.synced || now - r.createdAt > PHONE_UNSYNCED_MAX_DAYS * DAY)
    .map(r => r.id);
}

// Audio is deleted SERVER_MAX_DAYS after transcription. A recording that was never transcribed (the
// model failed, or speech recognition is switched off) is deleted SERVER_MAX_DAYS after it arrived,
// so a failure cannot keep a caregiver's voice on the server for ever.
function serverDeletions(records, now = Date.now()) {
  return records
    .filter(r => {
      const since = r.transcribedAt || r.receivedAt;
      return since ? now - since > SERVER_MAX_DAYS * DAY : true; // no date at all: delete, never keep
    })
    .map(r => r.id);
}

// Strictly true: a record read back from storage may say consentQuality: "no", which is truthy.
function canListen(user, record) {
  return Boolean(user && user.role === 'quality_reviewer' && record && record.consentQuality === true);
}

// Every listen leaves a line the reviewer can audit: who, which recording, when. Never the audio itself.
function listenAudit(user, record, now = new Date()) {
  if (!canListen(user, record)) throw new Error('not allowed to listen to this recording');
  return { who: user.name, recording: record.id, at: now.toISOString() };
}

module.exports = {
  PHONE_UNSYNCED_MAX_DAYS, SERVER_MAX_DAYS,
  queueRecording, markSynced, phoneDeletions, serverDeletions, canListen, listenAudit,
};
