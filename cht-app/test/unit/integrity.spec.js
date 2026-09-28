const { expect } = require('chai');
const fs = require('fs');
const path = require('path');

// Cross-checks that break silently otherwise: a task pointing at a form that doesn't exist, a
// title or target label with no English text, a form without its properties file.
const ROOT = path.join(__dirname, '..', '..');
const tasks = require(path.join(ROOT, 'tasks.js'));
const targets = require(path.join(ROOT, 'targets.js'));
const englishKeys = new Set(fs.readFileSync(path.join(ROOT, 'translations', 'messages-en.properties'), 'utf8')
  .split('\n')
  .filter(line => line.includes('=') && !line.trim().startsWith('#'))
  .map(line => line.slice(0, line.indexOf('=')).trim()));
const hasText = key => englishKeys.has(key);
const appForm = name => path.join(ROOT, 'forms', 'app', name);

describe('App integrity', () => {
  it('every task title has English text', () => {
    tasks.forEach(t => expect(hasText(t.title), t.name).to.equal(true));
  });

  it('every task action opens a form that exists, with a properties file', () => {
    tasks.forEach(t => t.actions.forEach(a => {
      expect(fs.existsSync(appForm(`${a.form}.xml`)), `${t.name} -> ${a.form}`).to.equal(true);
      expect(fs.existsSync(appForm(`${a.form}.properties.json`)), `${a.form}.properties.json`).to.equal(true);
    }));
  });

  it('every task name is unique', () => {
    const names = tasks.map(t => t.name);
    expect(new Set(names).size).to.equal(names.length);
  });

  it('every target has English text for its title', () => {
    targets.forEach(t => expect(hasText(t.translation_key), t.id).to.equal(true));
  });

  it('every app form has a properties file', () => {
    fs.readdirSync(path.join(ROOT, 'forms', 'app')).filter(f => f.endsWith('.xml')).forEach(f => {
      expect(fs.existsSync(appForm(f.replace('.xml', '.properties.json'))), f).to.equal(true);
    });
  });
});
