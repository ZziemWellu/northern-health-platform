// Which client-facing texts a language can actually deliver today.
//
//   node shared/languages/coverage.js                     (tier 1 and 2 languages, all five regions)
//   node shared/languages/coverage.js --district=Kumbungu (the languages listed for one district)
//   node shared/languages/coverage.js --all               (every language in the registry)
//
// "usable" means a checked or approved translation of the CURRENT English. Everything else is sent in
// English, so this table is the honest answer to "can a Dagbani-speaking mother get this in Dagbani?"
const languages = require('./index');
const { catalogue } = require('./catalogue');

function coverage(codes, { dir } = {}) {
  const items = catalogue();
  return codes.map(code => {
    const lang = languages.REGISTRY.languages[code];
    const row = { code, name: lang.name, tier: lang.tier, usable: 0, draft: 0, stale: 0, missing: 0, total: items.length };
    const entries = languages.loadTranslations(code, dir);
    for (const item of items) {
      const e = Object.prototype.hasOwnProperty.call(entries, item.key) ? entries[item.key] : null;
      if (!e) row.missing++;
      else if (e.source !== item.english) row.stale++;
      else if (languages.unusableReason(e, item.english)) row.draft++;
      else row.usable++;
    }
    return row;
  });
}

function codesFor({ district, all } = {}) {
  const reg = languages.REGISTRY.languages;
  if (district) return languages.forDistrict(district);
  return Object.keys(reg).filter(c => c !== 'en' && (all || reg[c].tier <= 2));
}

module.exports = { coverage, codesFor };

if (require.main === module) {
  const arg = n => (process.argv.find(a => a.startsWith(`--${n}=`)) || '').slice(n.length + 3) || null;
  const district = arg('district');
  const codes = codesFor({ district, all: process.argv.includes('--all') });
  if (district && !codes.length) {
    console.error(`No language is listed for "${district}" in shared/languages/languages.json. Ask the District Health Directorate and add it.`);
    process.exitCode = 1;
  } else {
    const rows = coverage(codes);
    console.log(`${district ? `${district}: ` : ''}${rows[0] ? rows[0].total : 0} client-facing texts (SMS, voice replies, voice words)\n`);
    console.log('code   language                 tier  usable  draft  stale  missing');
    for (const r of rows) {
      console.log(`${r.code.padEnd(6)} ${r.name.padEnd(24)} ${String(r.tier).padStart(4)}  ${String(r.usable).padStart(6)}  ${String(r.draft).padStart(5)}  ${String(r.stale).padStart(5)}  ${String(r.missing).padStart(7)}`);
    }
    console.log('\nOnly "usable" texts reach a client in her language; the rest go in English.');
  }
}
