// Writes voice/replies.json: the approved English replies, plus only the CHECKED translations, for the
// offline voice_question form (cht-app/tools/build_voice_forms.py) and the prototype showcase.
// Drafts are left out on purpose: whatever is in this file can be shown to a caregiver.
//
//   node voice/export_replies.js           (then: cd cht-app && npm run build)
const fs = require('node:fs');
const path = require('node:path');
const { REPLIES, INTENTS } = require('./intents');
const languages = require('../shared/languages');

function exportReplies({ dir } = {}) {
  const translations = {};
  for (const code of Object.keys(languages.REGISTRY.languages)) {
    if (code === 'en') continue;
    for (const [id, r] of Object.entries(REPLIES)) {
      const t = languages.translation(`voice.reply.${id}`, code, r.en, { dir });
      if (!t.ok) continue;
      translations[code] = translations[code] || { _name: languages.REGISTRY.languages[code].name };
      translations[code][id] = t.text;
    }
  }
  return { replies: REPLIES, intents: INTENTS.map(i => i.id), translations };
}

module.exports = { exportReplies };

if (require.main === module) {
  const out = path.join(__dirname, 'replies.json');
  fs.writeFileSync(out, JSON.stringify(exportReplies(), null, 2) + '\n');
  console.log(`wrote ${out}`);
}
