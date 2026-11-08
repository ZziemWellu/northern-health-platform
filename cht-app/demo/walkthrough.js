#!/usr/bin/env node
// Walks through the demo in the real app, as the Dalun nurse on a phone-sized screen, with
// captions, and checks each step's result. With --record it also makes a video of it.
// SYNTHETIC DATA ONLY: run it after `npm run demo-seed`, on the same server.
//
//   node demo/walkthrough.js --url=https://host[:port] --password=<demo nurse password>
//        [--user=demo_nurse_dalun] [--record] [--insecure] [--out=DIR] [--chrome=PATH]
//
// --record needs ffmpeg on the PATH. Output (default cht-app/.demo-out/walkthrough/):
//   NN-step.png screenshots, walkthrough.mp4 (with --record), and walkthrough.log.
// The walkthrough changes the demo data (it records a danger check and a referral for Fuseina);
// re-seed before a live demo.
const fs = require('node:fs');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const puppeteer = require('puppeteer-core');
const scenario = require('./scenario');

const APP = path.resolve(__dirname, '..');
const sleep = ms => new Promise(r => setTimeout(r, ms));

function args(argv) {
  const a = Object.fromEntries(argv.filter(x => x.startsWith('--')).map(x => {
    const [k, ...v] = x.slice(2).split('=');
    return [k, v.length ? v.join('=') : true];
  }));
  if (!a.url) throw new Error('--url=https://host is required');
  const password = a.password || process.env.NHP_DEMO_NURSE_PASSWORD;
  if (!password) throw new Error('--password (or NHP_DEMO_NURSE_PASSWORD) is required');
  return {
    base: new URL(a.url).origin, password, user: a.user || 'demo_nurse_dalun', record: !!a.record,
    insecure: !!a.insecure, out: path.resolve(a.out || path.join(APP, '.demo-out', 'walkthrough')),
    chrome: a.chrome || 'C:/Program Files/Google/Chrome/Application/chrome.exe',
  };
}

// ---- captions and title cards, drawn over the app --------------------------------------------

const OVERLAY = () => {
  window.__caption = (text, sub) => {
    let el = document.getElementById('__demo_caption');
    if (!el) {
      el = document.createElement('div');
      el.id = '__demo_caption';
      el.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:2147483647;background:rgba(17,24,39,.92);' +
        'color:#fff;font:600 15px/1.35 system-ui,sans-serif;padding:10px 12px;border-radius:10px;pointer-events:none;' +
        'box-shadow:0 4px 16px rgba(0,0,0,.35)';
      document.documentElement.appendChild(el);
    }
    el.innerHTML = text ? `${text}${sub ? `<div style="font-weight:400;font-size:13px;opacity:.85;margin-top:4px">${sub}</div>` : ''}` : '';
    el.style.display = text ? 'block' : 'none';
  };
  window.__card = (title, lines, footer) => {
    if (title && window.__caption) window.__caption('');
    let el = document.getElementById('__demo_card');
    if (!title) { if (el) el.remove(); return; }
    if (!el) {
      el = document.createElement('div');
      el.id = '__demo_card';
      el.style.cssText = 'position:fixed;inset:0;z-index:2147483646;background:#0f3d3e;color:#fff;display:flex;' +
        'flex-direction:column;justify-content:center;padding:28px;font:16px/1.45 system-ui,sans-serif';
      document.documentElement.appendChild(el);
    }
    el.innerHTML = `<div style="font-size:24px;font-weight:700;margin-bottom:14px">${title}</div>` +
      lines.map(l => `<div style="margin:6px 0">${l}</div>`).join('') +
      (footer ? `<div style="margin-top:22px;font-size:13px;opacity:.8">${footer}</div>` : '');
  };
};

// ---- recording: Chrome's screencast frames, joined by ffmpeg at their real timing -----------

async function startRecording(page, dir) {
  fs.mkdirSync(dir, { recursive: true });
  const cdp = await page.target().createCDPSession();
  const frames = [];
  cdp.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    const file = path.join(dir, `f${String(frames.length).padStart(5, '0')}.jpg`);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    frames.push({ file, t: metadata.timestamp });
    await cdp.send('Page.screencastFrameAck', { sessionId }).catch(() => {});
  });
  await cdp.send('Page.startScreencast', { format: 'jpeg', quality: 85, everyNthFrame: 1 });
  return {
    async stop(outFile) {
      await cdp.send('Page.stopScreencast').catch(() => {});
      await sleep(300);
      if (frames.length < 2) throw new Error('no video frames were captured');
      const end = Date.now() / 1000;
      const list = frames.map((f, i) => {
        const next = i + 1 < frames.length ? frames[i + 1].t : end;
        return `file '${f.file.replace(/\\/g, '/')}'\nduration ${Math.max(0.04, next - f.t).toFixed(3)}`;
      }).join('\n') + `\nfile '${frames[frames.length - 1].file.replace(/\\/g, '/')}'\n`;
      const listFile = path.join(dir, 'frames.txt');
      fs.writeFileSync(listFile, list);
      execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', listFile,
        '-vf', 'scale=trunc(iw/2)*2:trunc(ih/2)*2,fps=25', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', outFile]);
      return frames.length;
    },
  };
}

// ---- driving the app -------------------------------------------------------------------------

function helpers(page, o, log) {
  let shot = 0;
  const h = {
    caption: (text, sub) => page.evaluate((t, s) => window.__caption && window.__caption(t, s), text, sub),
    card: (title, lines, footer) => page.evaluate((t, l, f) => window.__card && window.__card(t, l, f), title, lines || [], footer),
    async hold(ms) { await sleep(ms); },
    async shot(name) {
      shot++;
      await page.screenshot({ path: path.join(o.out, `${String(shot).padStart(2, '0')}-${name}.png`) });
    },
    async text() { return page.evaluate(() => document.body.innerText); },
    async waitText(re, timeout = 120000) {
      await page.waitForFunction(src => new RegExp(src, 'i').test(document.body.innerText), { timeout, polling: 500 }, re.source);
    },
    async clickText(re, selector = 'button, a, .btn') {
      const done = await page.evaluate((src, sel) => {
        const r = new RegExp(src, 'i');
        const el = [...document.querySelectorAll(sel)].find(e => e.offsetParent !== null && !e.disabled && r.test(e.innerText.trim()));
        if (el) { el.scrollIntoView({ block: 'center' }); el.click(); return el.innerText.trim(); }
        return null;
      }, re.source, selector);
      if (!done) throw new Error(`nothing to click matching ${re}`);
      return done;
    },
    // Answers a question on the current Enketo page, whatever widget it uses.
    async answer(name, value) {
      const ok = await page.evaluate((n, v) => {
        const radios = [...document.querySelectorAll(`input[type=radio][name="${n}"], input[type=checkbox][name="${n}"]`)];
        if (radios.length) {
          const r = radios.find(x => x.value === v);
          if (!r) return `no option ${v}`;
          r.scrollIntoView({ block: 'center' });
          r.click();
          return 'ok';
        }
        const sel = document.querySelector(`select[name="${n}"]`);
        if (sel) {
          if (![...sel.options].some(x => x.value === v)) return `no option ${v} in ${[...sel.options].map(x => x.value).slice(0, 8)}`;
          sel.value = v;
          sel.dispatchEvent(new Event('change', { bubbles: true }));
          return 'ok';
        }
        const input = document.querySelector(`input[name="${n}"], textarea[name="${n}"]`);
        if (input) { input.scrollIntoView({ block: 'center' }); return 'type'; }
        return 'missing';
      }, name, value);
      if (ok === 'type') {
        const sel = `input[name="${name}"], textarea[name="${name}"]`;
        await page.click(sel, { clickCount: 3 });
        await page.type(sel, value, { delay: 90 });
        await page.$eval(sel, el => el.dispatchEvent(new Event('change', { bubbles: true })));
      } else if (ok !== 'ok') {
        throw new Error(`answering ${name}=${value}: ${ok}`);
      }
      await sleep(350);
    },
    async next() { await h.clickText(/^next$/i); await sleep(1500); },
    async submit() {
      await h.clickText(/^submit$/i);
      await page.waitForFunction(() => !document.querySelector('.enketo form'), { timeout: 60000, polling: 500 }).catch(() => {});
      await sleep(2500);
    },
    async dismissModals() {
      for (let i = 0; i < 3; i++) {
        const clicked = await page.evaluate(() => {
          const modal = document.querySelector('.modal.show, mat-dialog-container, .mat-mdc-dialog-container');
          if (!modal) return null;
          const btn = [...modal.querySelectorAll('button, a')].find(b => /reload|close|skip|ok|got it/i.test(b.innerText));
          if (btn) { const t = btn.innerText.trim(); btn.click(); return t; }
          return null;
        });
        if (!clicked) return;
        log(`  closed a pop-up (${clicked})`);
        await sleep(2500);
      }
    },
    async go(hash) {
      await page.goto(`${o.base}/${hash}`, { waitUntil: 'domcontentloaded' });
      await sleep(1500);
      // After a task's form, CHT shows the household's other tasks and asks before leaving.
      const left = await page.evaluate(() => {
        const btn = [...document.querySelectorAll('mat-dialog-container button, .modal button')].find(b => /^exit$/i.test(b.innerText.trim()));
        if (btn) { btn.click(); return true; }
        return false;
      });
      if (left) {
        await sleep(1500);
        await page.goto(`${o.base}/${hash}`, { waitUntil: 'domcontentloaded' });
        await sleep(1500);
      }
      await page.evaluate(OVERLAY);
    },
  };
  return h;
}

async function main() {
  const o = args(process.argv.slice(2));
  fs.mkdirSync(o.out, { recursive: true });
  for (const f of fs.readdirSync(o.out)) if (/\.(png|jpg|mp4|txt|log)$/.test(f)) fs.rmSync(path.join(o.out, f));
  const logLines = [];
  const log = (...x) => { const line = x.join(' '); logLines.push(line); console.log(line); };
  const checks = [];
  const check = (name, ok, detail = '') => { checks.push({ name, ok }); log(`  ${ok ? 'PASS' : 'FAIL'} ${name}${detail ? `: ${detail}` : ''}`); };

  const s = scenario.build();
  const person = key => s.people.find(p => p.woman._id.endsWith(key)).woman;
  const fuseina = person('dalun-fuseina');

  const browser = await puppeteer.launch({
    executablePath: o.chrome, headless: true, ignoreHTTPSErrors: o.insecure,
    args: ['--lang=en-GB', ...(o.insecure ? ['--ignore-certificate-errors'] : [])],
    defaultViewport: { width: 412, height: 860, deviceScaleFactor: 2, isMobile: true, hasTouch: true },
  });
  let rec;
  try {
    const page = await browser.newPage();
    await page.evaluateOnNewDocument(OVERLAY);
    const h = helpers(page, o, log);

    log('Logging in');
    await page.goto(`${o.base}/medic/login`, { waitUntil: 'networkidle2' });
    await page.type('#user', o.user);
    await page.type('#password', o.password);
    await Promise.all([page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 120000 }).catch(() => {}), page.click('#login')]);
    await h.waitText(/tasks/, 300000);
    await sleep(8000); // first sync and task calculation
    await h.dismissModals();

    if (o.record) rec = await startRecording(page, path.join(o.out, 'frames'));

    // 1. Title card
    await page.evaluate(OVERLAY);
    await h.card('Northern Health Platform', [
      'Community health app for CHPS nurses in Northern Ghana, built on the Community Health Toolkit (open source).',
      'Pilot scope: <b>Module 1</b> (danger signs and visit priority), <b>raising a referral</b>, and <b>Module 5</b> (the monthly DHIMS-2 file).',
      'Shown as a nurse in Dalun CHPS zone, Kumbungu, on an ordinary Android phone.',
    ], 'All people and records are made up (synthetic). Nothing here is clinically approved yet.');
    await h.hold(7000);
    await h.shot('title');
    await h.card(null);

    // 2. Today's tasks
    await h.go('#/tasks');
    await h.waitText(/raise referral/i, 180000).catch(() => {});
    await h.caption('Today\'s visits, most urgent first', 'Each task says why it is urgent. Ayishetu\'s blood pressure was 165/112 this morning, so her referral comes first.');
    await h.hold(6500);
    await h.shot('tasks');
    const tasksText = await h.text();
    const firstTask = await page.evaluate(() => {
      const row = document.querySelector('#tasks-list li, .tasks-list li, mm-content-row, .content-row');
      return row ? row.innerText.replace(/\s+/g, ' ').trim() : '';
    });
    check('a referral is at the top of the task list', /referral/i.test(firstTask) && /ayishetu/i.test(firstTask), firstTask.slice(0, 100));
    check('the newborn first-day visit is listed', /sanatu|newborn/i.test(tasksText));

    // 3. Fuseina's profile: her language
    await h.go(`#/contacts/${fuseina._id}`);
    await h.waitText(/language/i, 90000);
    await page.evaluate(() => {
      const el = [...document.querySelectorAll('label, .cell label, p, span')].find(e => /^language$/i.test(e.innerText.trim()));
      if (el) el.scrollIntoView({ block: 'center' });
    });
    await h.caption('Fuseina Abukari, about 30 weeks pregnant', 'Her language is recorded as Dagbani: reminders go out in Dagbani once a checked translation exists.');
    await h.hold(6000);
    await h.shot('profile-language');
    const profile = await h.text();
    check('the profile shows her language as Dagbani', /dagbani/i.test(profile));

    // 4. Danger-sign check (Module 1)
    await h.go(`#/contacts/${fuseina._id}/report/maternal_danger_assessment`);
    await page.waitForSelector('input[name="/data/stage_page/stage"]', { timeout: 120000 });
    await h.caption('Danger-sign check at today\'s visit', 'The nurse records what she finds; the app applies the rules.');
    await h.answer('/data/stage_page/stage', 'pregnant');
    await h.hold(1500);
    await h.next();
    await h.answer('/data/vitals/systolic_bp', '150');
    await h.answer('/data/vitals/diastolic_bp', '100');
    await h.answer('/data/vitals/temperature', '36.9');
    await h.hold(1500);
    await h.shot('assessment-vitals');
    await h.next();
    for (const [q, v] of [['convulsions', 'no'], ['severe_headache', 'yes'], ['blurred_vision', 'no'], ['epigastric_pain', 'no'],
      ['vaginal_bleeding', 'no'], ['foul_discharge', 'no'], ['fever_reported', 'no']]) {
      await h.answer(`/data/symptoms/${q}`, v);
    }
    await h.caption('Blood pressure 150/100 with a severe headache', 'Each finding alone is not an emergency. Together they are signs of possible pre-eclampsia.');
    await h.hold(2500);
    await h.next();
    await h.caption('The result: emergency, refer now', 'The reason is shown in plain words, so the nurse can explain it to the family.');
    await h.hold(6500);
    await h.shot('assessment-result');
    const result = await h.text();
    check('the assessment says emergency (possible pre-eclampsia)', /pre-eclampsia/i.test(result));
    await h.submit();

    // 5. Raise the referral from the task it created
    await h.go('#/tasks');
    await h.waitText(/fuseina/i, 120000).catch(() => {});
    await h.caption('A "raise referral" task appears straight away', 'It goes to the top of the list.');
    await h.hold(4500);
    await h.shot('tasks-after-assessment');
    const opened = await page.evaluate(() => {
      const rows = [...document.querySelectorAll('#tasks-list li, .tasks-list li, mm-content-row, .content-row')];
      const row = rows.find(r => /fuseina/i.test(r.innerText) && /referral/i.test(r.innerText));
      const link = row && (row.querySelector('a') || row);
      if (link) { link.click(); return true; }
      return false;
    });
    check('a referral task for Fuseina appeared', opened);
    if (opened) {
      await page.waitForSelector('[name="/data/why/severity"]', { timeout: 120000 });
      await sleep(1500);
      await h.caption('Raising the referral', 'The reason comes from the assessment. An emergency can only go to a hospital.');
      await h.answer('/data/why/severity', 'emergency');
      await h.hold(1500);
      await h.next();
      await h.answer('/data/destination/dest_region', 'northern');
      await sleep(800);
      await h.answer('/data/destination/dest_facility', 'tamale_central_hospital_northern');
      await h.hold(2500);
      await h.shot('referral-destination');
      await h.next();
      await h.answer('/data/people/present', 'husband');
      await h.answer('/data/people/decider_present', 'yes');
      await h.hold(1500);
      await h.next();
      await h.caption('Referral code for the family to show at the hospital', 'Arrival tracking (Module 2) comes after the pilot; the code is already on the referral.');
      await h.hold(6500);
      await h.shot('referral-summary');
      const summary = await h.text();
      check('the referral has a code', /\bR[0-9a-f]{6}\b/i.test(summary), (summary.match(/\bR[0-9a-f]{6}\b/i) || [''])[0]);
      await h.submit();
    }

    // 6. Targets
    await h.go('#/analytics/targets');
    await h.waitText(/this month/i, 60000).catch(() => {});
    await sleep(2500);
    await h.caption('This month at a glance', 'Pregnancies registered, births, visits and referrals, counted from the nurse\'s own records.');
    await h.hold(6500);
    await h.shot('targets');
    const targets = await page.evaluate(() => (document.querySelector('.targets, mm-analytics-targets, .page') || document.body).innerText);
    check('the targets page lists this month\'s targets', /this month/i.test(targets) && !/other household tasks/i.test(targets));

    // 7. Module 5: last month's file for DHIMS-2
    const csvFile = fs.readdirSync(path.join(APP, '.demo-out')).filter(f => /^module5_\d{6}_DEMO\.csv$/.test(f)).sort().pop();
    if (csvFile) {
      const rows = fs.readFileSync(path.join(APP, '.demo-out', csvFile), 'utf8').trim().split('\n').map(l => l.split(','));
      const names = JSON.parse(fs.readFileSync(path.resolve(APP, '..', 'docs', 'pitch', 'demo_module5', 'mapping.json'), 'utf8'));
      const measureOf = Object.fromEntries(Object.entries(names).map(([k, v]) => [v.dataElement, k.replace(/_/g, ' ')]));
      const zoneOf = { DemoDalun01: 'Dalun', DemoGbulun1: 'Gbullung', DemoBontng1: 'Bontanga' };
      const body = rows.slice(1).map(r => `<tr><td>${zoneOf[r[2]] || r[2]}</td><td>${measureOf[r[0]] || r[0]}</td><td style="text-align:right">${r[4]}</td></tr>`).join('');
      await h.card(`Module 5: ${csvFile.slice(8, 12)}-${csvFile.slice(12, 14)} file for DHIMS-2`, [
        '<table style="width:100%;border-collapse:collapse;font-size:13px">' +
        '<tr style="text-align:left;opacity:.8"><th>CHPS zone</th><th>Measure</th><th style="text-align:right">Count</th></tr>' + body + '</table>',
        'Counted from the nurses\' reports, with exact numbers. No paper tally. The district imports the file into DHIMS-2.',
      ], 'Demo identifiers, not real DHIMS-2 codes. Measures must be matched to GHS definitions before use.');
      await h.hold(9000);
      await h.shot('module5-file');
      await h.card(null);
    }

    // 8. Closing card
    await h.card('What this needs next', [
      '1. A clinical advisor to review and sign off each module.',
      '2. Agreement from the Kumbungu District Health Directorate and ethics approval.',
      '3. Five nurses using it for six weeks, to measure whether it helps.',
      '4. Ghana-hosted server and Data Protection Commission registration before any real data.',
    ], 'Open source, offline-first, and reporting into DHIMS-2, the district\'s own system.');
    await h.hold(8000);
    await h.shot('next-steps');

    if (rec) {
      const n = await rec.stop(path.join(o.out, 'walkthrough.mp4'));
      log(`Video: ${path.join(o.out, 'walkthrough.mp4')} (${n} frames)`);
    }

    // Not in the video: the live script registers Mariama's pregnancy, so the app must offer it.
    const mariama = person('dalun-mariama');
    await h.go(`#/contacts/${mariama._id}`);
    await page.waitForFunction(() => /Mariama Iddrisu/.test(document.body.innerText) && /Medic ID/i.test(document.body.innerText),
      { timeout: 60000, polling: 500 });
    await sleep(2000);
    await h.card(null);
    await h.caption('');
    await page.evaluate(() => {
      // The contact list keeps its own (hidden) button in the page; use the visible one on her profile.
      const fabs = [...document.querySelectorAll('button.fast-action-fab-button, mm-fast-action-button button')]
        .filter(b => b.offsetParent !== null && b.getBoundingClientRect().width > 0);
      if (fabs.length) fabs[fabs.length - 1].click();
    });
    await sleep(2500);
    const actions = await h.text();
    await h.shot('mariama-actions');
    check('Mariama can be registered (the pregnancy form is offered)', /pregnancy registration/i.test(actions));
  } finally {
    await browser.close();
    fs.writeFileSync(path.join(o.out, 'walkthrough.log'), logLines.join('\n') + '\n');
  }
  const failed = checks.filter(c => !c.ok);
  log(`\n${checks.length - failed.length}/${checks.length} checks passed`);
  if (failed.length) process.exitCode = 1;
}

main().catch(err => { console.error(`\nFAILED: ${err.message}`); process.exitCode = 1; });
