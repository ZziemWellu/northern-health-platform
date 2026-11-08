// The translators' workpack: a spreadsheet (CSV, UTF-8) per language, and the check that brings it back.
//
//   node shared/languages/workpack.js export --lang=dag --out=dag_workpack.csv
//   node shared/languages/workpack.js import --lang=dag --in=dag_workpack.csv [--dry-run]
//
// The process each translation goes through (docs/LANGUAGES.md):
//   1. a native speaker from the district translates (status "draft");
//   2. a SECOND native speaker, who did not translate it, reads it back into English without seeing the
//      original (back_translation); the project lead compares; if the meaning matches, status "checked";
//   3. the clinical advisor approves the clinical ones (status "approved").
// Only "checked" and "approved" text reaches a client.
//
// Import is all or nothing: one bad row and nothing is written, so a half-checked file never goes live.
const fs = require('node:fs');
const path = require('node:path');
const languages = require('./index');
const { catalogue, placeholders } = require('./catalogue');

const COLUMNS = ['key', 'context', 'english', 'rules', 'translation', 'back_translation', 'translator', 'checker', 'status', 'date', 'note'];
const MAX_PARTS_WARN = 2;

function csvCell(v) {
  const s = v === undefined || v === null ? '' : String(v);
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

// RFC 4180, with a UTF-8 byte-order mark tolerated (Excel adds one).
function parseCsv(text) {
  const s = String(text).replace(/^﻿/, '');
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < s.length; i++) {
    const ch = s[i];
    if (quoted) {
      if (ch === '"' && s[i + 1] === '"') { cell += '"'; i++; }
      else if (ch === '"') quoted = false;
      else cell += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === ',') { row.push(cell); cell = ''; }
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && s[i + 1] === '\n') i++;
      row.push(cell); rows.push(row); row = []; cell = '';
    } else cell += ch;
  }
  if (cell !== '' || row.length) { row.push(cell); rows.push(row); }
  if (quoted) throw new Error('the file ends inside a quoted cell');
  const [header, ...body] = rows.filter(r => r.some(c => c.trim() !== ''));
  if (!header) return [];
  return body.map(r => Object.fromEntries(header.map((h, i) => [h.trim(), r[i] === undefined ? '' : r[i]])));
}

function rulesFor(item) {
  const rules = [];
  if (item.placeholders.length) rules.push(`Keep ${item.placeholders.map(p => `{${p}}`).join(' ')} exactly as written`);
  if (item.keep.length) rules.push(`Keep the word ${item.keep.join(', ')} in capitals (the phone network listens for it)`);
  if (item.type === 'sms') rules.push('Letters such as ɛ ɔ ŋ make an SMS cost 2-3 times more; use them where the language needs them, but keep it short');
  if (item.type === 'voice.words') rules.push('Separate words with " | "');
  return rules.join('. ');
}

function exportWorkpack(lang, { dir } = {}) {
  const code = languages.normaliseCode(lang);
  if (!code || code === 'en') throw new Error(`"${lang}" is not a language to translate into`);
  const existing = languages.loadTranslations(code, dir);
  const lines = [COLUMNS.join(',')];
  for (const item of catalogue()) {
    const e = existing[item.key] || {};
    const stale = e.source !== undefined && e.source !== item.english;
    const translation = item.type === 'voice.words' ? (e.words || []).join(' | ') : e.text;
    lines.push([
      item.key, item.context, item.english, rulesFor(item), translation, e.back_translation, e.translator, e.checker,
      e.status || '', e.date, stale ? `ENGLISH CHANGED since this was translated: re-check. ${e.note || ''}`.trim() : e.note,
    ].map(csvCell).join(','));
  }
  return '﻿' + lines.join('\r\n') + '\r\n';
}

// Checks every row. Returns { entries, errors, warnings }; entries only matter when errors is empty.
function checkWorkpack(lang, rows) {
  const code = languages.normaliseCode(lang);
  const items = new Map(catalogue().map(i => [i.key, i]));
  const entries = {};
  const errors = [];
  const warnings = [];
  const seen = new Set();
  rows.forEach((r, i) => {
    const where = `row ${i + 2} (${r.key || 'no key'})`;
    const item = items.get((r.key || '').trim());
    if (!item) { errors.push(`${where}: unknown key`); return; }
    if (seen.has(item.key)) { errors.push(`${where}: key appears twice`); return; }
    seen.add(item.key);
    const translation = (r.translation || '').normalize('NFC').trim();
    if (!translation) return; // not translated yet: nothing to import
    if ((r.english || '').trim() && r.english.trim() !== item.english) {
      errors.push(`${where}: the English in this file is not the current English; export a fresh workpack`);
      return;
    }
    const status = (r.status || 'draft').trim().toLowerCase();
    if (!languages.STATUSES.includes(status)) { errors.push(`${where}: status must be one of ${languages.STATUSES.join(', ')}`); return; }
    const entry = {
      status, source: item.english,
      translator: (r.translator || '').trim(), checker: (r.checker || '').trim(),
      back_translation: (r.back_translation || '').trim(), date: (r.date || '').trim(),
    };
    if (r.note && r.note.trim()) entry.note = r.note.trim();
    if (item.type === 'voice.words') {
      entry.words = translation.split('|').map(w => w.trim()).filter(Boolean);
      if (!entry.words.length) { errors.push(`${where}: no words`); return; }
    } else {
      entry.text = translation;
      const want = item.placeholders.join(',');
      const got = placeholders(translation).join(',');
      if (want !== got) errors.push(`${where}: placeholders must be ${want || 'none'}, found ${got || 'none'}`);
      for (const word of item.keep) if (!translation.includes(word)) errors.push(`${where}: must keep the word ${word}`);
      if (/\d/.test(translation.replace(/\{\w+\}/g, '')) && !/\d/.test(item.english)) {
        warnings.push(`${where}: has a digit the English does not (is "3" standing in for ɛ, or "c" for ɔ?)`);
      }
      if (item.type === 'sms') {
        const sms = languages.smsParts(translation.replace(/\{\w+\}/g, 'XXXXXXXXXXXX'));
        if (sms.parts > item.maxParts) errors.push(`${where}: ${sms.parts} SMS parts (${sms.encoding}); at most ${item.maxParts}`);
        else if (sms.parts > MAX_PARTS_WARN) warnings.push(`${where}: ${sms.parts} SMS parts (${sms.encoding}) with typical names filled in`);
      }
    }
    if (status !== 'draft') {
      const reason = languages.unusableReason(entry, item.english);
      if (reason) { errors.push(`${where}: marked ${status} but ${reason}`); return; }
      if (!entry.date || !/^\d{4}-\d{2}-\d{2}$/.test(entry.date)) errors.push(`${where}: a ${status} row needs the date it was checked (YYYY-MM-DD)`);
    }
    entries[item.key] = entry;
  });
  if (!code || code === 'en') errors.unshift(`"${lang}" is not a language to translate into`);
  return { entries, errors, warnings };
}

function importWorkpack(lang, csvText, { dir = process.env.NHP_TRANSLATIONS_DIR || languages.TRANSLATIONS_DIR, dryRun = false } = {}) {
  const code = languages.normaliseCode(lang);
  const result = checkWorkpack(lang, parseCsv(csvText));
  if (result.errors.length || dryRun) return { ...result, written: false };
  const file = path.join(dir, `${code}.json`);
  const current = fs.existsSync(file) ? JSON.parse(fs.readFileSync(file, 'utf8')) : { language: code, entries: {} };
  current.entries = { ...current.entries, ...result.entries };
  const tmp = `${file}.tmp`;
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(tmp, JSON.stringify(current, null, 2) + '\n');
  fs.renameSync(tmp, file);
  languages.clearCache();
  return { ...result, written: true, file };
}

module.exports = { COLUMNS, parseCsv, exportWorkpack, checkWorkpack, importWorkpack };

if (require.main === module) {
  const [cmd] = process.argv.slice(2);
  const arg = n => (process.argv.find(a => a.startsWith(`--${n}=`)) || '').slice(n.length + 3) || null;
  try {
    if (cmd === 'export') {
      const out = arg('out') || `${arg('lang')}_workpack.csv`;
      fs.writeFileSync(out, exportWorkpack(arg('lang')));
      console.log(`Wrote ${out}: ${catalogue().length} items for ${languages.language(arg('lang')).name}`);
    } else if (cmd === 'import') {
      const r = importWorkpack(arg('lang'), fs.readFileSync(arg('in'), 'utf8'), { dryRun: process.argv.includes('--dry-run') });
      r.warnings.forEach(w => console.log(`warning: ${w}`));
      r.errors.forEach(e => console.error(`error: ${e}`));
      if (r.errors.length) { console.error('Nothing was written.'); process.exitCode = 1; }
      else console.log(r.written ? `Wrote ${Object.keys(r.entries).length} entries to ${r.file}` : `Checked ${Object.keys(r.entries).length} entries; nothing written (dry run)`);
    } else {
      console.error('Usage: workpack.js export --lang=dag [--out=file.csv] | import --lang=dag --in=file.csv [--dry-run]');
      process.exitCode = 2;
    }
  } catch (err) { console.error(err.message); process.exitCode = 1; }
}
