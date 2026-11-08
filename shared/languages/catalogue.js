// Every piece of client-facing text that needs translating, with what a translator must know about it.
// The English lives in its own module (SMS templates, voice replies); this file only lists it, so the
// catalogue can never drift from what is actually sent.
const { TEMPLATES } = require('../../sms/templates');
const { REPLIES, INTENTS } = require('../../voice/intents');

const PLACEHOLDER = /\{(\w+)\}/g;
const placeholders = text => [...String(text).matchAll(PLACEHOLDER)].map(m => m[1]).sort();

const SMS_CONTEXT = {
  anc_visit: 'SMS to a pregnant woman reminding her of her next antenatal clinic visit. May be read by others on a shared phone: no health details.',
  birth_plan: 'SMS asking a pregnant woman to plan how she will get to the facility for the birth.',
  referral: 'SMS after the CHW referred her to a facility, asking her to go today.',
};

const VOICE_CONTEXT = {
  emergency: 'Spoken reply when a caregiver describes a danger sign. Must say to go NOW (not "today"). Clinical sign-off needed.',
  visit_date: 'Spoken reply to a question about when to come to the clinic.',
  transport: 'Spoken reply when getting to the facility is the problem.',
  feeding: 'Spoken reply to a feeding question; points her to the CHW.',
  unknown: 'Spoken reply when the question was not understood. Must never sound like a refusal.',
};

const WORDS_CONTEXT = {
  emergency: 'Words and short phrases a caregiver might SAY for a danger sign (bleeding, fits, not breathing, severe headache, blurred vision, fever, water broke, baby not moving or not feeding, yellow eyes). Include everyday and local ways of saying them. Separate with " | ". Too many is safer than too few.',
  visit_date: 'Words a caregiver might say when asking when to come to the clinic. Separate with " | ".',
  transport: 'Words for transport, a ride, money for the trip, cannot go. Separate with " | ".',
  feeding: 'Words for feeding, breastmilk, porridge, food, drink. Separate with " | ".',
};

function catalogue() {
  const items = [];
  for (const [kind, t] of Object.entries(TEMPLATES)) {
    items.push({
      key: `sms.${kind}`, type: 'sms', english: t.en, context: SMS_CONTEXT[kind] || 'SMS reminder.',
      placeholders: placeholders(t.en), keep: t.en.includes('STOP') ? ['STOP'] : [], maxParts: 3,
    });
  }
  for (const [id, r] of Object.entries(REPLIES)) {
    items.push({ key: `voice.reply.${id}`, type: 'voice.reply', english: r.en, context: VOICE_CONTEXT[id] || 'Spoken reply.', placeholders: placeholders(r.en), keep: [] });
  }
  for (const intent of INTENTS) {
    items.push({ key: `voice.words.${intent.id}`, type: 'voice.words', english: intent.words.join(' | '), context: WORDS_CONTEXT[intent.id] || 'Words. Separate with " | ".', placeholders: [], keep: [] });
  }
  return items;
}

module.exports = { catalogue, placeholders };
