const { test, beforeEach, afterEach } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const languages = require('..');
const { catalogue } = require('../catalogue');
const { exportWorkpack, checkWorkpack, importWorkpack, parseCsv } = require('../workpack');
const { coverage, codesFor } = require('../coverage');

const EN_ANC = require('../../../sms/templates').TEMPLATES.anc_visit.en;

let dir;
beforeEach(() => {
  dir = fs.mkdtempSync(path.join(os.tmpdir(), 'nhp-lang-'));
  process.env.NHP_TRANSLATIONS_DIR = dir;
  languages.clearCache();
});
afterEach(() => {
  delete process.env.NHP_TRANSLATIONS_DIR;
  languages.clearCache();
  fs.rmSync(dir, { recursive: true, force: true });
});

const write = (code, entries) => {
  fs.writeFileSync(path.join(dir, `${code}.json`), JSON.stringify({ language: code, entries }));
  languages.clearCache();
};
const checked = (text, source, extra = {}) => ({
  text, source, status: 'checked', translator: 'A. Translator', checker: 'B. Checker', back_translation: 'back', date: '2026-11-08', ...extra,
});

// ---- the registry ------------------------------------------------------------------------------

test('all five northern regions are covered, each with its main languages in the registry', () => {
  const { regions, languages: langs } = languages.REGISTRY;
  assert.deepEqual(Object.keys(regions).sort(), ['north_east', 'northern', 'savannah', 'upper_east', 'upper_west']);
  for (const [id, r] of Object.entries(regions)) {
    assert.ok(r.main.length > 0, id);
    for (const code of [...r.main, ...r.also]) {
      assert.ok(langs[code], `${id} lists unknown language ${code}`);
      assert.ok(langs[code].regions.includes(id), `${code} does not list region ${id}`);
    }
  }
  for (const [code, l] of Object.entries(langs)) {
    assert.ok([1, 2, 3].includes(l.tier), code);
    for (const region of l.regions) assert.ok(regions[region], `${code}: unknown region ${region}`);
  }
});

test('every region\'s main languages are tier 1 or 2, so none is left for "later"', () => {
  for (const [id, r] of Object.entries(languages.REGISTRY.regions)) {
    for (const code of r.main) assert.ok(languages.REGISTRY.languages[code].tier <= 2, `${id}: ${code}`);
  }
});

test('no name or alias points at two languages', () => {
  const seen = new Map();
  for (const [code, l] of Object.entries(languages.REGISTRY.languages)) {
    for (const key of [code, l.name, ...(l.aliases || [])].map(k => k.toLowerCase())) {
      assert.ok(!seen.has(key) || seen.get(key) === code, `"${key}" is both ${seen.get(key)} and ${code}`);
      seen.set(key, code);
    }
  }
});

test('codes, names and aliases all resolve; unknown ones do not', () => {
  assert.equal(languages.normaliseCode('dag'), 'dag');
  assert.equal(languages.normaliseCode('Dagbanli'), 'dag');
  assert.equal(languages.normaliseCode(' FRAFRA '), 'gur');
  assert.equal(languages.normaliseCode('tw'), 'twi');
  assert.equal(languages.normaliseCode('Sissala'), 'sld');
  assert.equal(languages.normaliseCode('Klingon'), null);
  assert.equal(languages.normaliseCode(''), null);
  assert.equal(languages.normaliseCode(undefined), null);
});

test('the pilot district is Dagbani-speaking, and Twi is not any district\'s language', () => {
  assert.equal(languages.REGISTRY.pilot.district, 'Kumbungu');
  assert.deepEqual(languages.forDistrict('Kumbungu'), ['dag']);
  assert.deepEqual(languages.forDistrict('Bawku Municipal').slice(0, 1), ['kus']);
  assert.ok(languages.forDistrict('Bimbilla').includes('dag'));
  assert.equal(languages.REGISTRY.languages.twi.districts, undefined);
  assert.deepEqual(languages.forDistrict('Nowhere'), []);
});

// ---- choosing what a client receives ------------------------------------------------------------

test('a checked translation in her own language is used', () => {
  write('dag', { 'sms.anc_visit': checked('DAG {name} {facility} {date} STOP', EN_ANC) });
  const p = languages.pick('sms.anc_visit', EN_ANC, { preferred_language: 'dag' });
  assert.deepEqual([p.lang, p.text, p.fallback], ['dag', 'DAG {name} {facility} {date} STOP', false]);
});

test('drafts are never used, and the reason is given', () => {
  write('dag', { 'sms.anc_visit': { ...checked('DAG', EN_ANC), status: 'draft' } });
  const p = languages.pick('sms.anc_visit', EN_ANC, { preferred_language: 'dag' });
  assert.equal(p.lang, 'en');
  assert.equal(p.fallback, true);
  assert.deepEqual(p.tried, [{ lang: 'dag', reason: 'status is draft' }]);
});

test('"checked" needs a back-translation and a second speaker who is not the translator', () => {
  write('dag', { 'sms.anc_visit': checked('DAG', EN_ANC, { back_translation: '' }) });
  assert.equal(languages.pick('sms.anc_visit', EN_ANC, { preferred_language: 'dag' }).tried[0].reason, 'no back-translation');
  write('dag', { 'sms.anc_visit': checked('DAG', EN_ANC, { checker: ' a. translator ' }) });
  assert.equal(languages.pick('sms.anc_visit', EN_ANC, { preferred_language: 'dag' }).tried[0].reason, 'not checked by a second speaker');
});

test('a translation of old English is stale and not used', () => {
  write('dag', { 'sms.anc_visit': checked('DAG', 'Some older English') });
  const p = languages.pick('sms.anc_visit', EN_ANC, { preferred_language: 'dag' });
  assert.equal(p.lang, 'en');
  assert.match(p.tried[0].reason, /English has changed/);
});

test('her other languages are tried in order; a language she did not list is never used', () => {
  write('twi', { 'sms.anc_visit': checked('TWI', EN_ANC) });
  write('hau', { 'sms.anc_visit': checked('HAU', EN_ANC) });
  // Dagbani speaker, no Dagbani yet, also understands Hausa: Hausa, not Twi.
  assert.equal(languages.pick('sms.anc_visit', EN_ANC, { preferred_language: 'dag', other_languages: 'hau' }).lang, 'hau');
  // Dagbani speaker who lists nothing else: English, even though Twi exists.
  assert.equal(languages.pick('sms.anc_visit', EN_ANC, { preferred_language: 'dag' }).lang, 'en');
  // No language recorded at all: English, flagged.
  const none = languages.pick('sms.anc_visit', EN_ANC, {});
  assert.deepEqual([none.lang, none.fallback], ['en', true]);
  // English chosen on purpose is not a fallback.
  assert.equal(languages.pick('sms.anc_visit', EN_ANC, { preferred_language: 'en' }).fallback, false);
});

test('CHT\'s space-separated other_languages and aliases are understood', () => {
  assert.deepEqual(languages.clientLanguages({ preferred_language: 'Dagbanli', other_languages: 'hau  tw dag other' }), ['dag', 'hau', 'twi']);
});

test('approved translations are used without a second-speaker record', () => {
  write('gur', { 'sms.anc_visit': { text: 'GUR', source: EN_ANC, status: 'approved' } });
  assert.equal(languages.pick('sms.anc_visit', EN_ANC, { preferred_language: 'Frafra' }).lang, 'gur');
});

test('the shipped Twi texts are drafts, so no caregiver hears them until checked', () => {
  delete process.env.NHP_TRANSLATIONS_DIR;
  languages.clearCache();
  const twi = languages.loadTranslations('twi');
  assert.ok(Object.keys(twi).length >= 5);
  for (const e of Object.values(twi)) assert.equal(e.status, 'draft');
});

// ---- SMS length -------------------------------------------------------------------------------

test('one letter outside GSM-7 (ɛ, ɔ, ŋ) turns an SMS into UCS-2 and shortens each part to 70', () => {
  assert.deepEqual(languages.smsParts('a'.repeat(160)), { encoding: 'GSM-7', length: 160, parts: 1 });
  assert.equal(languages.smsParts('a'.repeat(161)).parts, 2);
  assert.equal(languages.smsParts('[]').length, 4);
  assert.deepEqual(languages.smsParts('ɛ' + 'a'.repeat(69)), { encoding: 'UCS-2', length: 70, parts: 1 });
  assert.equal(languages.smsParts('ŋ' + 'a'.repeat(70)).parts, 2);
  assert.equal(languages.smsParts('ɔ'.repeat(135)).parts, 3);
});

// ---- the workpack -----------------------------------------------------------------------------

const rowFor = (key, extra) => {
  const item = catalogue().find(i => i.key === key);
  return { key, english: item.english, translation: '', status: '', translator: '', checker: '', back_translation: '', date: '', ...extra };
};

test('the workpack lists every client-facing text, with the rules a translator must keep', () => {
  const rows = parseCsv(exportWorkpack('dag', { dir }));
  assert.equal(rows.length, catalogue().length);
  const anc = rows.find(r => r.key === 'sms.anc_visit');
  assert.equal(anc.english, EN_ANC);
  assert.match(anc.rules, /\{date\} \{facility\} \{name\}/);
  assert.match(anc.rules, /STOP/);
  assert.ok(rows.some(r => r.key === 'voice.words.emergency'));
  assert.ok(exportWorkpack('dag', { dir }).startsWith('﻿'), 'Excel needs the BOM to show ɛ and ɔ');
  assert.throws(() => exportWorkpack('en'));
});

test('a checked workpack imports, and the client then gets her language', () => {
  const csv = exportWorkpack('dag', { dir });
  const rows = parseCsv(csv).map(r => (r.key === 'sms.anc_visit'
    ? { ...r, translation: 'Dasiba {name}. {facility} {date}. STOP', status: 'checked', translator: 'A', checker: 'B', back_translation: 'Greetings', date: '2026-11-08' }
    : r));
  const back = ['key,english,translation,status,translator,checker,back_translation,date',
    ...rows.map(r => [r.key, r.english, r.translation, r.status, r.translator, r.checker, r.back_translation, r.date]
      .map(v => `"${String(v || '').replace(/"/g, '""')}"`).join(','))].join('\n');
  const result = importWorkpack('dag', back, { dir });
  assert.deepEqual(result.errors, []);
  assert.equal(result.written, true);
  const { renderFor } = require('../../../sms/templates');
  const msg = renderFor('anc_visit', { name: 'Ama', facility: 'Kumbungu HC', date: '2026-11-20' }, { preferred_language: 'dag' });
  assert.deepEqual([msg.lang, msg.text], ['dag', 'Dasiba Ama. Kumbungu HC 2026-11-20. STOP']);
});

test('import refuses lost placeholders, a lost STOP, unchecked "checked" rows and an old English', () => {
  const r = checkWorkpack('dag', [
    rowFor('sms.anc_visit', { translation: 'Dasiba. STOP', status: 'draft' }),
    rowFor('sms.birth_plan', { translation: 'Dasiba {name} {facility}', status: 'draft' }),
    rowFor('sms.referral', { translation: 'Dasiba {name} {facility} STOP', status: 'checked', translator: 'A', checker: 'A', back_translation: 'x', date: '2026-11-08' }),
    rowFor('voice.reply.unknown', { translation: 'Text', english: 'Old English', status: 'draft' }),
    rowFor('voice.reply.feeding', { translation: 'Text', status: 'checked', translator: 'A', checker: 'B', back_translation: 'x' }),
    rowFor('voice.reply.transport', { translation: 'Text', status: 'final' }),
    { key: 'sms.nope', translation: 'x' },
  ]);
  const text = r.errors.join('\n');
  assert.match(text, /sms\.anc_visit.*placeholders/);
  assert.match(text, /sms\.birth_plan.*must keep the word STOP/);
  assert.match(text, /sms\.referral.*not checked by a second speaker/);
  assert.match(text, /voice\.reply\.unknown.*not the current English/);
  assert.match(text, /voice\.reply\.feeding.*needs the date/);
  assert.match(text, /voice\.reply\.transport.*status must be/);
  assert.match(text, /sms\.nope.*unknown key/);
});

test('one bad row and nothing is written', () => {
  const csv = ['key,translation,status',
    `voice.reply.unknown,Dagbani text,draft`,
    `sms.anc_visit,no placeholders,draft`].join('\n');
  const result = importWorkpack('dag', csv, { dir });
  assert.equal(result.written, false);
  assert.equal(fs.existsSync(path.join(dir, 'dag.json')), false);
});

test('an SMS too long for three UCS-2 parts is refused', () => {
  const long = `{name} {facility} {date} STOP ${'ɛ'.repeat(200)}`;
  const r = checkWorkpack('dag', [rowFor('sms.anc_visit', { translation: long, status: 'draft' })]);
  assert.match(r.errors.join('\n'), /SMS parts \(UCS-2\)/);
});

test('emergency words from a checked translation make the matcher hear an emergency', () => {
  const { INTENTS, matchIntent } = require('../../../voice/intents');
  const source = INTENTS[0].words.join(' | ');
  assert.equal(matchIntent('o ŋmɛri zim', 'dag'), 'unknown');
  write('dag', { 'voice.words.emergency': { ...checked(undefined, source), words: ['zim', 'ŋmɛri'] } });
  assert.equal(matchIntent('o ŋmɛri zim', 'dag'), 'emergency');
  // A draft word list is not used.
  write('dag', { 'voice.words.emergency': { ...checked(undefined, source), words: ['zim'], status: 'draft' } });
  assert.equal(matchIntent('o zim', 'dag'), 'unknown');
});

// ---- coverage ---------------------------------------------------------------------------------

test('coverage counts usable, draft, stale and missing texts per language', () => {
  write('dag', {
    'sms.anc_visit': checked('x', EN_ANC),
    'sms.birth_plan': { ...checked('x', 'old'), status: 'checked' },
    'sms.referral': { text: 'x', status: 'draft', source: require('../../../sms/templates').TEMPLATES.referral.en },
  });
  const [row] = coverage(['dag'], { dir });
  assert.deepEqual([row.usable, row.stale, row.draft, row.missing], [1, 1, 1, catalogue().length - 3]);
  assert.deepEqual(codesFor({ district: 'Kumbungu' }), ['dag']);
  assert.ok(codesFor({}).includes('gjn'));
  assert.ok(!codesFor({}).includes('twi'));
});
