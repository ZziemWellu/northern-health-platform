// Languages for client-facing text (SMS reminders, voice replies) in the five northern regions.
//
// Rules this module enforces, because a wrong message in a health app can hurt someone:
//   1. A client gets a translation only in a language SHE listed (her preferred language, then the
//      other languages she understands). Nothing is guessed from her district: a Dagbani speaker is
//      never sent Twi because Twi happens to be translated.
//   2. A translation is used only once a second native speaker has checked it (status "checked", with
//      a back-translation and a checker who is not the translator) or the clinical advisor has
//      approved it ("approved"). Drafts are never sent.
//   3. A translation is tied to the English it was made from. If the English changes, the translation
//      is stale and is not used until it is re-checked.
//   4. When no usable translation exists, the client gets the English text, and the result says so
//      (fallback: true, with the reasons), so the gap is counted rather than hidden.
const fs = require('node:fs');
const path = require('node:path');

const REGISTRY = JSON.parse(fs.readFileSync(path.join(__dirname, 'languages.json'), 'utf8'));
const TRANSLATIONS_DIR = path.join(__dirname, 'translations');
const STATUSES = ['draft', 'checked', 'approved'];
const SENDABLE = new Set(['checked', 'approved']);

const own = (obj, key) => obj != null && Object.prototype.hasOwnProperty.call(obj, key);

// Code, alias or name -> registry code ("Dagbanli" -> "dag", "tw" -> "twi"). Unknown -> null.
const LOOKUP = new Map();
for (const [code, lang] of Object.entries(REGISTRY.languages)) {
  for (const key of [code, lang.name, ...(lang.aliases || [])]) LOOKUP.set(key.normalize('NFC').toLowerCase(), code);
}
function normaliseCode(value) {
  if (typeof value !== 'string' || !value.trim()) return null;
  return LOOKUP.get(value.trim().normalize('NFC').toLowerCase()) || null;
}

function language(code) {
  const c = normaliseCode(code);
  return c ? { code: c, ...REGISTRY.languages[c] } : null;
}

// Languages listed for a district (case-insensitive, ignoring "Municipal"/"District"), tier order.
// For planning and for the coverage report only; never used to choose what a client is sent.
function forDistrict(district) {
  const clean = s => String(s || '').toLowerCase().replace(/\b(municipal|metropolitan|district)\b/g, '').replace(/[^a-z]+/g, ' ').trim();
  const want = clean(district);
  if (!want) return [];
  return Object.entries(REGISTRY.languages)
    .filter(([, l]) => (l.districts || []).some(d => clean(d) === want || clean(d).startsWith(`${want} `)))
    // Tier first; within a tier a district's own language before a lingua franca such as Hausa.
    .sort(([, a], [, b]) => (a.tier - b.tier) || ((a.role ? 1 : 0) - (b.role ? 1 : 0)))
    .map(([code]) => code);
}

function forRegion(region) {
  const r = REGISTRY.regions[region];
  return r ? [...r.main, ...r.also] : [];
}

// ---- translation store ----------------------------------------------------------------------

const cache = new Map();
// NHP_TRANSLATIONS_DIR points the store elsewhere (tests; a deployment that keeps translations apart).
function loadTranslations(code, dir = process.env.NHP_TRANSLATIONS_DIR || TRANSLATIONS_DIR) {
  const key = `${dir}|${code}`;
  if (cache.has(key)) return cache.get(key);
  const file = path.join(dir, `${code}.json`);
  const data = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { language: code, entries: {} };
  if (data.language !== code) throw new Error(`${file} says it is "${data.language}", expected "${code}"`);
  cache.set(key, data.entries || {});
  return cache.get(key);
}
function clearCache() { cache.clear(); }

// Why an entry may not be used, or null if it may.
function unusableReason(entry, english) {
  if (!entry) return 'not translated';
  if (!STATUSES.includes(entry.status)) return `unknown status "${entry.status}"`;
  if (!SENDABLE.has(entry.status)) return `status is ${entry.status}`;
  if (entry.status === 'checked') {
    if (!entry.back_translation) return 'no back-translation';
    if (!entry.translator || !entry.checker || entry.translator.trim().toLowerCase() === entry.checker.trim().toLowerCase()) {
      return 'not checked by a second speaker';
    }
  }
  if (english !== undefined && entry.source !== english) return 'English has changed since it was translated';
  return null;
}

// The text for one key in one language, or a reason it cannot be used.
function translation(key, code, english, { dir } = {}) {
  const c = normaliseCode(code);
  if (!c) return { ok: false, reason: `unknown language "${code}"` };
  if (c === 'en') return { ok: true, lang: 'en', text: english };
  const entry = own(loadTranslations(c, dir), key) ? loadTranslations(c, dir)[key] : null;
  const reason = unusableReason(entry, english);
  if (reason) return { ok: false, lang: c, reason };
  return { ok: true, lang: c, text: entry.text, words: entry.words, status: entry.status };
}

// The languages a client understands, in her order of preference, with English last as the fallback.
// Accepts the CHT person fields (preferred_language, other_languages as a space-separated list).
function clientLanguages(client = {}) {
  const raw = [client.preferred_language, ...String(client.other_languages || '').split(/[\s,]+/)];
  const out = [];
  for (const v of raw) {
    const c = normaliseCode(v);
    if (c && !out.includes(c)) out.push(c);
  }
  return out;
}

// Chooses the text a client receives for `key`. See the rules at the top of this file.
function pick(key, english, client, opts) {
  const tried = [];
  for (const code of clientLanguages(client)) {
    const t = translation(key, code, english, opts);
    if (t.ok) return { lang: t.lang, text: t.text, fallback: false, tried };
    tried.push({ lang: code, reason: t.reason });
  }
  return { lang: 'en', text: english, fallback: tried.length > 0 || clientLanguages(client).length === 0, tried };
}

// ---- SMS length -----------------------------------------------------------------------------
// Most northern orthographies use letters outside the GSM 03.38 alphabet (ɛ, ɔ, ŋ, ɣ, ʒ, ɩ, ʋ). One
// such letter switches the whole message to UCS-2: 70 characters a part instead of 160, so the same
// reminder can cost two or three times as much. Translators see this in the workpack.
const GSM_BASIC = '@£$¥èéùìòÇ\nØø\rÅåΔ_ΦΓΛΩΠΨΣΘΞÆæßÉ !"#¤%&\'()*+,-./0123456789:;<=>?¡ABCDEFGHIJKLMNOPQRSTUVWXYZÄÖÑÜ§¿abcdefghijklmnopqrstuvwxyzäöñüà';
const GSM_EXT = '^{}\\[~]|€\f';
function smsParts(text) {
  const s = String(text);
  let gsmLen = 0;
  let gsm = true;
  for (const ch of s) {
    if (GSM_BASIC.includes(ch)) gsmLen += 1;
    else if (GSM_EXT.includes(ch)) gsmLen += 2;
    else { gsm = false; break; }
  }
  if (gsm) return { encoding: 'GSM-7', length: gsmLen, parts: gsmLen <= 160 ? 1 : Math.ceil(gsmLen / 153) };
  const units = s.length; // UTF-16 code units
  return { encoding: 'UCS-2', length: units, parts: units <= 70 ? 1 : Math.ceil(units / 67) };
}

module.exports = {
  REGISTRY, STATUSES, SENDABLE, TRANSLATIONS_DIR,
  normaliseCode, language, forDistrict, forRegion,
  loadTranslations, clearCache, unusableReason, translation, clientLanguages, pick, smsParts,
};
