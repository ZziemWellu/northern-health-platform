const { test } = require('node:test');
const assert = require('node:assert/strict');
const { matchIntent, replyFor, REPLIES } = require('../intents');
const { respondToTranscript, respondToAudio } = require('../respond');

test('an emergency wins over any other word in the same sentence', () => {
  assert.equal(matchIntent('I have bleeding and I need to know when the clinic is open'), 'emergency');
  assert.equal(matchIntent('the baby had fits this morning, what date is my visit'), 'emergency');
});

test('matches whole words only: "data" is not "da"', () => {
  assert.equal(matchIntent('the data is wrong'), 'unknown');
  assert.equal(matchIntent('what date is my visit'), 'visit_date');
});

test('recognises the everyday questions in English', () => {
  assert.equal(matchIntent('when is my clinic appointment'), 'visit_date');
  assert.equal(matchIntent('I cannot go, there is no transport'), 'transport');
  assert.equal(matchIntent('what food should my baby eat'), 'feeding');
});

test('recognises the Twi words in the first draft', () => {
  assert.equal(matchIntent('wo clinic nsɔhwɛ bɛba bere bɛn'), 'visit_date');
  assert.equal(matchIntent('akwantu yɛ me ho ɔhaw'), 'transport');
});

test('anything it cannot match gets the safe default, never a guess', () => {
  const r = respondToTranscript({ transcript: 'my neighbour owes me money' });
  assert.equal(r.intent, 'unknown');
  assert.equal(r.text, REPLIES.unknown.en);
});

test('an empty or missing transcript is treated as unknown', () => {
  assert.equal(matchIntent(''), 'unknown');
  assert.equal(matchIntent(undefined), 'unknown');
});

test('every reply is marked pilot until the reviewer approves it', () => {
  for (const [id, reply] of Object.entries(REPLIES)) {
    assert.equal(reply.status, 'pilot', id);
    assert.ok(reply.en && reply.en.length > 0, `${id} has English`);
  }
});

test('no reply gives a clinical instruction, dose or diagnosis', () => {
  for (const reply of Object.values(REPLIES)) {
    for (const lang of ['en', 'tw']) {
      assert.doesNotMatch(reply[lang], /\bdose\b|\bmg\b|tablet|diagnos|take .* pill|malaria|pre-?eclampsia/i);
    }
  }
});

test('falls back to English when a translation is missing', () => {
  const r = replyFor('transport', 'fr');
  assert.equal(r.text, REPLIES.transport.en);
});

test('the audit line records the intent and language, never the spoken words', () => {
  const r = respondToTranscript({ transcript: 'I have bleeding', lang: 'en' });
  assert.equal(r.audit.intent, 'emergency');
  assert.equal(JSON.stringify(r.audit).includes('bleeding'), false);
});

test('audio goes through the injected transcriber, then the same matching', async () => {
  const r = await respondToAudio({
    audioPath: '/tmp/x.wav',
    transcriber: async (p) => { assert.equal(p, '/tmp/x.wav'); return 'when is my visit'; },
  });
  assert.equal(r.intent, 'visit_date');
});
