// Voice support: a caregiver speaks, the system matches what they said to ONE of a fixed set of
// approved replies. It never composes medical advice. Anything it cannot match gets the safe default,
// and anything that sounds like an emergency gets the emergency instruction first.
//
// Every reply is PILOT-status until the reviewer approves it. Twi wording is a first draft: it must
// be checked by a Twi speaker from the district before any caregiver hears it.
const REPLIES = {
  emergency: {
    status: 'pilot',
    en: 'This may be an emergency. Go to the nearest health facility now. If you cannot travel, call your CHW or the emergency number right away.',
    tw: 'Eyi betumi ayɛ ahohia. Kɔ ayaresabea a ɛbɛn wo ho nnɛ. Sɛ wontumi nantew a, frɛ wo CHW anaa ahohia nɔma nnɛ.',
  },
  visit_date: {
    status: 'pilot',
    en: 'Your next clinic visit is on the date your CHW gave you. Please come. If you do not know the date, ask your CHW.',
    tw: 'Wo clinic nsɔhwɛ a edi hɔ no yɛ da a wo CHW kyerɛɛ wo. Sɛ wonnim da no a, bisa wo CHW.',
  },
  transport: {
    status: 'pilot',
    en: 'If transport is a problem, tell your CHW. Your CHW can help you plan a ride to the facility.',
    tw: 'Sɛ akwantu yɛ ɔhaw a, ka kyerɛ wo CHW. Wo CHW betumi aboa wo ma wonhyehyɛ akwantu.',
  },
  feeding: {
    status: 'pilot',
    en: 'For feeding questions, your CHW will help. Ask them to show you an approved feeding plan for your baby.',
    tw: 'Sɛ w\'abisa nneɛma a wɔde bɛma abofra no ho a, wo CHW bɛboa wo. Bisa no sɛ ɔnkyerɛ wo nnuane a wɔapene so.',
  },
  unknown: {
    status: 'pilot',
    en: 'Sorry, I did not understand. Please call your CHW, or ask a family member to call them for you.',
    tw: 'Me ho ayɛ wo, minnte nea woka no. Frɛ wo CHW, anaa ka sɛ obi nfrɛ wɔn ma wo.',
  },
};

// Emergency words are checked first, so an emergency never waits behind a lesser match.
const INTENTS = [
  { id: 'emergency', words: ['bleeding', 'fits', 'convulsion', 'not breathing', 'unconscious', 'fainted', 'seizure', 'blood', 'mogya', 'ayaresa', 'mo nnhu'] },
  { id: 'visit_date', words: ['when', 'visit', 'appointment', 'clinic', 'date', 'bɛba', 'bere', 'nsɔhwɛ', 'daa', 'da'] },
  { id: 'transport', words: ['transport', 'bus', 'ride', 'money for', 'cannot go', 'akwantu', 'sika', 'ɛnkɔ'] },
  { id: 'feeding', words: ['feed', 'food', 'milk', 'breastfeed', 'porridge', 'drink', 'nnuane', 'aduane', 'nufu'] },
];

function normalise(text) {
  return String(text || '').toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').replace(/\s+/g, ' ').trim();
}

function matchIntent(transcript) {
  const text = ` ${normalise(transcript)} `;
  for (const intent of INTENTS) {
    if (intent.words.some(w => text.includes(` ${normalise(w)} `))) return intent.id;
  }
  return 'unknown';
}

// Returns the approved reply for the caller's language. Falls back to English where a translation
// has not been provided, so no caller ever gets an empty answer.
function replyFor(intentId, lang = 'en') {
  const reply = REPLIES[intentId] || REPLIES.unknown;
  return { intent: REPLIES[intentId] ? intentId : 'unknown', text: reply[lang] || reply.en, status: reply.status };
}

module.exports = { REPLIES, INTENTS, normalise, matchIntent, replyFor };
