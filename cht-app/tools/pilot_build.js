#!/usr/bin/env node
// Builds the PILOT version of the app: Modules 1 and 5 plus raising a referral, on top of cht-core's
// reference workflows (modules.PILOT). The committed app stays the full build; the pilot is compiled
// in a separate copy, so CI, the test harness and app_settings.json are unaffected.
//
//   npm run build-pilot                                   compile into .pilot-build/ and list what is in it
//   npm run build-pilot -- --url=https://medic:pass@host:10443 [--remove-other-forms]
//                                                         ...and upload it to that CHT server
//
// --remove-other-forms deletes, ON THAT SERVER, every app form the pilot does not ship (for example
// after the full app was uploaded there once). Use it on a test server; on a real one, only with the
// district's agreement, since it removes forms nurses may have open.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const modules = require('../modules');

const APP = path.resolve(__dirname, '..');
const OUT = path.join(APP, '.pilot-build');
const SKIP = new Set(['node_modules', 'test', '.pilot-build', '__pycache__', '.cache']);

function copyTree(from, to) {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    if (SKIP.has(entry.name)) continue;
    const src = path.join(from, entry.name);
    const dest = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(src, dest);
    else fs.copyFileSync(src, dest);
  }
}

function cht(args) {
  // shell: true lets Windows run the npx .cmd shim; the arguments here are ours, not user input.
  execFileSync('npx', ['cht', ...args], { cwd: OUT, stdio: 'inherit', shell: process.platform === 'win32' });
}

// The copy links to the app's own node_modules. Remove that link on its own first, so cleaning the
// old build can never reach through it into the real dependencies.
function cleanOut() {
  const link = path.join(OUT, 'node_modules');
  try {
    if (fs.lstatSync(link).isSymbolicLink()) fs.unlinkSync(link);
  } catch (err) {
    if (err.code !== 'ENOENT') throw err;
  }
  if (fs.existsSync(link)) throw new Error(`${link} is not a link; refusing to delete it`);
  fs.rmSync(OUT, { recursive: true, force: true });
}

function build({ url, removeOtherForms }) {
  cleanOut();
  copyTree(APP, OUT);
  // The copy uses the app's own installed tooling.
  fs.symlinkSync(path.join(APP, 'node_modules'), path.join(OUT, 'node_modules'), 'junction');
  // Single quotes: the app's lint rules run on this file when the rules are bundled.
  const parts = modules.PILOT.map(p => `'${p}'`).join(', ');
  fs.writeFileSync(path.join(OUT, 'profile.js'),
    `// Written by tools/pilot_build.js. Do not edit.\nmodule.exports = { name: 'pilot', parts: [${parts}] };\n`);

  const formsDir = path.join(OUT, 'forms', 'app');
  const allForms = fs.readdirSync(formsDir).filter(f => f.endsWith('.xml')).map(f => f.replace(/\.xml$/, ''));
  const pilotForms = modules.inProfile('form', allForms, { parts: modules.PILOT });
  const dropped = allForms.filter(f => !pilotForms.includes(f));
  for (const form of dropped) {
    for (const suffix of ['.xml', '.xlsx', '.properties.json']) fs.rmSync(path.join(formsDir, form + suffix), { force: true });
    fs.rmSync(path.join(formsDir, `${form}-media`), { recursive: true, force: true });
  }

  cht(['--no-check', 'compile-app-settings']);

  // Read back what was compiled, from the pilot copy's own task and target files.
  const load = file => { delete require.cache[require.resolve(file)]; return require(file); };
  for (const f of ['modules.js', 'profile.js']) delete require.cache[require.resolve(path.join(OUT, f))];
  const manifest = {
    built: new Date().toISOString(),
    parts: modules.PILOT,
    tasks: load(path.join(OUT, 'tasks.js')).map(t => t.name),
    targets: load(path.join(OUT, 'targets.js')).map(t => t.id),
    forms: pilotForms,
    notInPilot: dropped,
  };
  fs.writeFileSync(path.join(OUT, 'PILOT_MANIFEST.json'), JSON.stringify(manifest, null, 2) + '\n');
  console.log(`Pilot build in ${OUT}`);
  console.log(`  ${manifest.tasks.length} tasks, ${manifest.targets.length} targets, ${manifest.forms.length} app forms`);
  console.log(`  not in the pilot: ${dropped.join(', ')}`);

  if (url) {
    cht([`--url=${url}`, '--accept-self-signed-certs', '--force',
      'upload-app-settings', 'upload-app-forms', 'upload-contact-forms', 'upload-resources', 'upload-custom-translations']);
    if (removeOtherForms && dropped.length) cht([`--url=${url}`, '--accept-self-signed-certs', '--force', 'delete-forms', '--', ...dropped]);
  }
  return manifest;
}

if (require.main === module) {
  const arg = name => {
    const hit = process.argv.find(a => a.startsWith(`--${name}=`));
    return hit ? hit.slice(name.length + 3) : null;
  };
  try {
    build({ url: arg('url'), removeOtherForms: process.argv.includes('--remove-other-forms') });
  } catch (err) {
    console.error(err.message);
    process.exitCode = 1;
  }
}

module.exports = { build, OUT };
