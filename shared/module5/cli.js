// Usage: node shared/module5/cli.js <counts.json> <mapping.json> <period> <out-dir>
// counts.json: { "<orgUnitUID>": { "<measure>": <count> } }   mapping.json: { "<measure>": { "dataElement": "<UID>" } }
// Writes <period>.csv and <period>.report.json. The CSV is written only when import-ready.
const fs = require('node:fs');
const path = require('node:path');
const { buildExport, validateCsv } = require('./export');

const [countsFile, mappingFile, period, outDir] = process.argv.slice(2);
if (!countsFile || !mappingFile || !period || !outDir) {
  console.error('usage: node cli.js <counts.json> <mapping.json> <period> <out-dir>');
  process.exit(2);
}
const counts = JSON.parse(fs.readFileSync(countsFile, 'utf8'));
const mapping = JSON.parse(fs.readFileSync(mappingFile, 'utf8'));
const out = buildExport({ counts, mapping, period });
const check = validateCsv(out.csv);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, `${period}.report.json`), JSON.stringify({ importReady: out.importReady, validation: check, ...out.report }, null, 2));
if (out.importReady && check.ok) {
  fs.writeFileSync(path.join(outDir, `${period}.csv`), out.csv);
  console.log(`wrote ${out.rows.length} rows to ${period}.csv`);
} else {
  console.log(`not import-ready: see ${period}.report.json (no CSV written)`);
  process.exitCode = 1;
}
