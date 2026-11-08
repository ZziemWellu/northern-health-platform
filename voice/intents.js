// Voice support: a caregiver speaks, the system matches what they said to ONE of a fixed set of
// approved replies. It never composes medical advice. Anything it cannot match gets the safe default,
// and anything that sounds like an emergency gets the emergency instruction first.
//
// Every reply is PILOT-status until the reviewer approves it. English is the source text. The reply in
// the caregiver's own language (Dagbani in Kumbungu; the other northern languages are listed in
// shared/languages/languages.json) comes from shared/languages/translations/<code>.json, keyed
// "voice.reply.<intent>", and is given only once a second native speaker has checked it. The first
// Twi drafts are kept there as drafts; Twi is not the language of any northern district.
const languages = require('../shared/languages');

const REPLIES = {
  emergency: {
    status: 'pilot',
    en: 'This may be an emergency. Go to the nearest health facility now. If you cannot travel, call your CHW or the emergency number right away.',
  },
  visit_date: {
    status: 'pilot',
    en: 'Your next clinic visit is on the date your CHW gave you. Please come. If you do not know the date, ask your CHW.',
  },
  transport: {
    status: 'pilot',
    en: 'If transport is a problem, tell your CHW. Your CHW can help you plan a ride to the facility.',
  },
  feeding: {
    status: 'pilot',
    en: 'For feeding questions, your CHW will help. Ask them to show you an approved feeding plan for your baby.',
  },
  unknown: {
    status: 'pilot',
    en: 'Sorry, I did not understand. Please call your CHW, or ask a family member to call them for you.',
  },
};

// Emergency words are checked first, so an emergency never waits behind a lesser match. Matching is on
// whole words or phrases, so each inflection is listed ("bleed", "bleeds", "bleeding", "bled").
//
// The English emergency list covers the danger signs the maternal danger assessment form already asks
// about (cht-app/tools/build_maternal_danger_assessment.py) plus the newborn signs in the voice phrases,
// so a caregiver describing one of them gets the emergency reply, not "call your CHW". A wrong
// emergency costs a trip; a missed one can cost a life, so the list errs towards emergency.
// CLINICAL SIGN-OFF REQUIRED, and the Twi words need a Twi speaker (see docs/CODE_REVIEW_2026-11-07.md).
const INTENTS = [
  {
    id: 'emergency',
    words: [
      'bleed', 'bleeds', 'bleeding', 'bled', 'blood',
      'fit', 'fits', 'fitting', 'convulsion', 'convulsions', 'convulsing', 'seizure', 'seizures',
      'not breathing', 'cannot breathe', 'can\'t breathe', 'difficulty breathing', 'hard to breathe',
      'unconscious', 'fainted', 'fainting', 'collapsed',
      'severe headache', 'bad headache', 'blurred vision', 'blurry', 'cannot see',
      'fever', 'hot body', 'very hot', 'smelly discharge', 'bad smell',
      'water broke', 'waters broke', 'water has broken', 'labour pains', 'labor pains', 'in labour', 'in labor',
      'not moving', 'stopped moving', 'not feeding', 'stopped feeding', 'yellow eyes',
      'mogya', 'ayaresa', 'mo nnhu',
    ],
  },
  { id: 'visit_date', words: ['when', 'visit', 'appointment', 'clinic', 'date', 'bɛba', 'bere', 'nsɔhwɛ', 'daa', 'da'] },
  { id: 'transport', words: ['transport', 'bus', 'ride', 'money for', 'cannot go', 'akwantu', 'sika', 'ɛnkɔ'] },
  { id: 'feeding', words: ['feed', 'food', 'milk', 'breastfeed', 'porridge', 'drink', 'nnuane', 'aduane', 'nufu'] },
];

// NFC first, so a letter typed with a separate accent mark is the same word as the composed letter;
// accent marks (\p{M}) are kept, so they do not split a Twi word in two.
function normalise(text) {
  return String(text || '').normalize('NFC').toLowerCase()
    .replace(/[‘’]/g, '\'')
    .replace(/[^\p{L}\p{M}\p{N}\s']/gu, ' ').replace(/\s+/g, ' ').trim();
}

// Words for one intent: the English and first-draft list above, plus the words a checked translation
// adds for the caller's language ("voice.words.<intent>" in shared/languages/translations; its source
// is the English list joined with " | ", so a change to the list makes the translation stale).
function wordsFor(intent, lang) {
  if (!lang || languages.normaliseCode(lang) === 'en') return intent.words;
  const t = languages.translation(`voice.words.${intent.id}`, lang, intent.words.join(' | '));
  return t.ok && Array.isArray(t.words) ? [...intent.words, ...t.words] : intent.words;
}

function hits(text, words) {
  return words.filter(w => text.includes(` ${normalise(w)} `)).length;
}

// Any emergency word wins outright. Otherwise the topic with the most matching words wins, so
// "when should I feed the baby" is about feeding, not the clinic date; a tie keeps the list order.
function matchIntent(transcript, lang) {
  const text = ` ${normalise(transcript)} `;
  const [emergency, ...others] = INTENTS;
  if (hits(text, wordsFor(emergency, lang)) > 0) return emergency.id;
  let best = { id: 'unknown', score: 0 };
  for (const intent of others) {
    const score = hits(text, wordsFor(intent, lang));
    if (score > best.score) best = { id: intent.id, score };
  }
  return best.id;
}

const hasReply = id => typeof id === 'string' && Object.prototype.hasOwnProperty.call(REPLIES, id);

// Returns the reply for the caller. `who` is a language code ("dag") or her CHT profile fields
// ({ preferred_language, other_languages }). She gets her own language only if a checked translation
// exists; otherwise the English, with fallback: true so the gap is visible. Never an empty answer.
function replyFor(intentId, who = 'en') {
  const intent = hasReply(intentId) ? intentId : 'unknown';
  const reply = REPLIES[intent];
  const client = typeof who === 'string' ? { preferred_language: who } : (who || {});
  const choice = languages.pick(`voice.reply.${intent}`, reply.en, client);
  return { intent, text: choice.text, status: reply.status, lang: choice.lang, fallback: choice.fallback };
}

module.exports = { REPLIES, INTENTS, normalise, matchIntent, replyFor };
