const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { matchIntent } = require('../intents');

const set = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'eval', 'caregiver_phrases.json'), 'utf8'));

test('the drafted caregiver phrases are matched to the intended topic', () => {
  const misses = set.phrases
    .map(p => ({ ...p, got: matchIntent(p.text) }))
    .filter(p => p.got !== p.intent);
  assert.deepEqual(misses, [], `phrases the matcher gets wrong: ${JSON.stringify(misses)}`);
});
