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
    assert.doesNotMatch(reply.en, /\bdose\b|\bmg\b|tablet|diagnos|take .* pill|malaria|pre-?eclampsia/i);
  }
});

test('falls back to English when a translation is missing, and says so', () => {
  const r = replyFor('transport', 'fr');
  assert.equal(r.text, REPLIES.transport.en);
  assert.equal(r.fallback, true);
  assert.equal(replyFor('transport', 'dag').lang, 'en');
});

test('the unchecked Twi drafts are no longer given to a caller', () => {
  const r = replyFor('emergency', 'tw');
  assert.equal(r.text, REPLIES.emergency.en);
  assert.doesNotMatch(r.text, /nnɛ/);
});

test('the audit line records the intent and language, never the spoken words', () => {
  const r = respondToTranscript({ transcript: 'I have bleeding', lang: 'en' });
  assert.equal(r.audit.intent, 'emergency');
  assert.equal(JSON.stringify(r.audit).includes('bleeding'), false);
});

test('the danger signs from the maternal danger assessment are emergencies, in their common forms', () => {
  for (const phrase of [
    'she bleeds a lot', 'she bled last night', 'she is convulsing', 'she had convulsions',
    'she has a severe headache', 'her vision is blurry', 'she has fever', 'her body is very hot',
    'there is a bad smell from below', 'her water broke', 'the baby is not moving',
    'the baby stopped feeding', 'the baby can’t breathe',
  ]) {
    assert.equal(matchIntent(phrase), 'emergency', phrase);
  }
});

test('the topic with the most matching words wins, so a feeding question is not sent to the clinic date', () => {
  assert.equal(matchIntent('when should I feed the baby porridge'), 'feeding');
  assert.equal(matchIntent('when is my clinic visit date'), 'visit_date');
});

test('a decomposed accent is the same word as the composed one', () => {
  assert.equal(require('../intents').normalise('café'), require('../intents').normalise('café'));
});

test('an unknown or inherited id never produces an empty reply', () => {
  for (const id of ['constructor', '__proto__', 'toString', 'nope', undefined]) {
    const r = replyFor(id, 'en');
    assert.equal(r.intent, 'unknown');
    assert.equal(r.text, REPLIES.unknown.en);
  }
  assert.equal(replyFor('transport', 'constructor').text, REPLIES.transport.en);
});

test('if speech recognition fails, the caller still gets the safe default reply', async () => {
  const r = await respondToAudio({ audioPath: '/a.amr', transcriber: async () => { throw new Error('model missing'); } });
  assert.equal(r.intent, 'unknown');
  assert.equal(r.text, REPLIES.unknown.en);
  assert.equal(r.audit.transcriberFailed, true);
});

test('audio goes through the injected transcriber, then the same matching', async () => {
  const r = await respondToAudio({
    audioPath: '/tmp/x.wav',
    transcriber: async (p) => { assert.equal(p, '/tmp/x.wav'); return 'when is my visit'; },
  });
  assert.equal(r.intent, 'visit_date');
});

test('the Akan model is never run on another language\'s audio: the caller gets the safe reply', async () => {
  let ran = false;
  const akan = async () => { ran = true; return 'bleeding'; };
  akan.lang = 'twi';
  const r = await respondToAudio({ audioPath: '/a.wav', transcriber: akan, lang: { preferred_language: 'dag' } });
  assert.equal(ran, false);
  assert.equal(r.intent, 'unknown');
  assert.equal(r.audit.noModelForLanguage, true);
  assert.equal(r.audit.lang, 'dag');
  const ok = await respondToAudio({ audioPath: '/a.wav', transcriber: akan, lang: 'tw' });
  assert.equal(ok.intent, 'emergency');
});

test('the shipped transcribers say which language their model understands', () => {
  const { akanTranscriber, whisperCppTranscriber } = require('../transcribe');
  assert.equal(akanTranscriber({ run: async () => '' }).lang, 'twi');
  assert.equal(whisperCppTranscriber({ bin: 'x', model: 'y' }).lang, 'twi');
  assert.equal(whisperCppTranscriber({ bin: 'x', model: 'y', language: 'xx', lang: 'dag' }).lang, 'dag');
});

test('the audit line records the reply language and whether it fell back to English', () => {
  const r = respondToTranscript({ transcript: 'when is my visit', lang: { preferred_language: 'dag' } });
  assert.deepEqual([r.audit.lang, r.audit.replyLang, r.audit.fallback], ['dag', 'en', true]);
});
