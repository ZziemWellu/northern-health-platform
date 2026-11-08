// Reminder texts. Deliberately non-clinical: no diagnosis, no danger sign, no drug or dose. A text
// that reaches a shared phone must not disclose a pregnancy complication to whoever reads it.
// Every text here needs the clinical reviewer and a community review before field use.
//
// English is the source. Translations into the client's own language (Dagbani for the Kumbungu
// pilot, and the other northern languages in shared/languages/languages.json) live in
// shared/languages/translations/<code>.json, keyed "sms.<kind>", and are used only once a second
// native speaker has checked them (shared/languages/index.js). Every translation keeps the word STOP,
// because that is the keyword the SMS gateway listens for.
const TEMPLATES = {
  anc_visit: {
    en: 'Hello {name}. Your next clinic visit at {facility} is due on {date}. Please come. Reply STOP to end these messages.',
  },
  birth_plan: {
    en: 'Hello {name}. Please plan how you will reach {facility} when your baby comes. Your CHW can help you plan. Reply STOP to end these messages.',
  },
  referral: {
    en: 'Hello {name}. Your CHW asked you to go to {facility} today. If you cannot go, please call your CHW. Reply STOP to end these messages.',
  },
};

// Every message must tell the reader how to stop them (consent, Data Protection Act 2012).
const OPT_OUT = 'Reply STOP to end these messages.';

const languages = require('../shared/languages');

const keyFor = kind => `sms.${kind}`;

function english(kind) {
  const t = Object.prototype.hasOwnProperty.call(TEMPLATES, kind) ? TEMPLATES[kind] : null;
  if (!t || !t.en) throw new Error(`No template for "${kind}"`);
  return t.en;
}

function fill(kind, template, values) {
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    if (values[key] === undefined || values[key] === '') throw new Error(`Missing "${key}" for ${kind} message`);
    return String(values[key]);
  });
}

// One language, strictly: throws if that language has no usable (checked) translation.
function render(kind, values, lang = 'en') {
  const t = languages.translation(keyFor(kind), lang, english(kind));
  if (!t.ok) throw new Error(`No usable ${lang} template for "${kind}": ${t.reason}`);
  return fill(kind, t.text, values);
}

// For a client: her own language if a checked translation exists, else English, saying why.
// client: { preferred_language, other_languages } as recorded on her CHT profile.
function renderFor(kind, values, client = {}) {
  const choice = languages.pick(keyFor(kind), english(kind), client);
  return { text: fill(kind, choice.text, values), lang: choice.lang, fallback: choice.fallback, tried: choice.tried };
}

module.exports = { TEMPLATES, OPT_OUT, render, renderFor, keyFor };
