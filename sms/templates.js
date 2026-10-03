// Reminder texts. Deliberately non-clinical: no diagnosis, no danger sign, no drug or dose. A text
// that reaches a shared phone must not disclose a pregnancy complication to whoever reads it.
// Every text here needs the clinical reviewer and a community review before field use, and Twi
// versions are still to be translated and checked. See CLINICAL_CONTENT.md.
const TEMPLATES = {
  anc_visit: {
    en: 'Hello {name}. Your next clinic visit at {facility} is due on {date}. Please come. Reply STOP to end these messages.',
  },
  birth_plan: {
    en: 'Hello {name}. Please plan how you will reach {facility} when your baby comes. Your CHW can help you plan.',
  },
  referral: {
    en: 'Hello {name}. Your CHW asked you to go to {facility} today. If you cannot go, please call your CHW.',
  },
};

function render(kind, values, lang = 'en') {
  const template = TEMPLATES[kind] && TEMPLATES[kind][lang];
  if (!template) throw new Error(`No ${lang} template for "${kind}"`);
  return template.replace(/\{(\w+)\}/g, (_, key) => {
    if (values[key] === undefined || values[key] === '') throw new Error(`Missing "${key}" for ${kind} message`);
    return String(values[key]);
  });
}

module.exports = { TEMPLATES, render };
