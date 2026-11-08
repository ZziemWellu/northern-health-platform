# Northern Ghana Community Health Platform

Offline-first community health modules for Ghana's five northern regions (Northern, Savannah,
North East, Upper East, Upper West), built on the [Community Health Toolkit](https://communityhealthtoolkit.org) (CHT).
Each module can ship on its own or together with the others. The design is in the
[blueprint](https://claude.ai/code/artifact/5815704a-0659-4d4f-89b8-8d14b7349c42).

| Module | Status |
| --- | --- |
| 1 Risk before crisis | In progress: urgency ranking, newborn home visits (day 1, 3, 7), maternal danger assessment with explained rules |
| 2 Last-mile follow-up | In progress: tracked referrals with code, destination and deadline; arrival follow-up; supervisor targets. The arrival server (`referral_arrival/`: facility confirms by code, overdue referrals escalate to the nurse) is built and tested, SMS dry-run by default. Not yet connected to the CHT referral form, and not deployed |
| 3 Local-food nutrition | In progress: nutrition engine (`nutrition/`) with checked prices, balanced least-cost plans and a nutritionist approval gate; CHT feeding counselling (approved plans only, dietary diversity) and market price forms. No plan approved yet |
| 4 Voice support | In progress: menu-first caregiver question form (the CHW picks the topic), approved replies in English, and in the caregiver's own language once a checked translation exists, consent and deletion rules for recordings (`voice/`). The first Twi drafts are kept as unchecked drafts and are never shown. Akan speech recognition is off by default (42.7% word error rate on 20 WAXAL clips) |
| 5 CHPS workflows | In progress: counts the month's CHT reports per CHPS zone (`shared/module5/from_cht.js`, run against a real CHT 5.3.1) and writes the DHIS2 / DHIMS-2 import file with exact counts (`shared/module5/`, `integration/`). Measures are drafts until mapped to the district's data elements. CHPS register workflows not started |
| 6 Hidden barriers | In progress: barrier screen with an action per barrier, birth plan with the decider (by 32 weeks), same-day barrier check after a missed referral, supervisor target |
| 7 Sick child and prevention | In progress: iCCM sick-child assessment (malaria, pneumonia, diarrhoea, danger signs) with day-3 follow-up, SMC dose tracking with catch-up and home-dose checks. Vaccine defaulter tracking not started |

**The pilot is Modules 1 and 5, plus raising a referral**, in Kumbungu (decided 8 November 2026; plan,
Phase 0 steps and the five-nurse field test in [docs/PILOT_PLAN.md](docs/PILOT_PLAN.md)). No new modules
until the pilot passes. `cd cht-app && npm run build-pilot` builds the pilot app; the committed app is the
full build. A run on a real CHT server is written up in [docs/E2E_RUN.md](docs/E2E_RUN.md).

**Local languages.** Every person's profile records the language they speak best and the others they
understand, chosen from the languages of the five northern regions (`shared/languages/languages.json`).
Reminders and voice replies use her language once a second native speaker has checked the translation;
until then she gets English and the gap is counted. Dagbani comes first, for Kumbungu. How translations
are made and checked, and which languages each region needs, is in [docs/LANGUAGES.md](docs/LANGUAGES.md).
`node shared/languages/coverage.js --district=Kumbungu` shows what a district can receive today.

> **Not for clinical use.** No module has clinical sign-off yet, so every clinical form shows a
> "PILOT - NOT FOR PATIENT CARE" warning. What a clinician must check, and how to sign a module off,
> is in [CLINICAL_CONTENT.md](CLINICAL_CONTENT.md); sign-offs are recorded in `clinical_signoff.json`.

## Layout

```
nutrition/                Module 3 feeding-plan engine (Python): data, optimiser, plans, approval
cht-app/                  CHT app configuration (forms, tasks, targets, translations, tests)
  priority.js             Module 1: one urgency ranking for the whole task list
  tasks.js                Task rules (reference tasks + Modules 1, 2, 6 and 7)
  targets.js              Dashboard targets (reference + referral completion, birth plans, SMC doses)
  forms/app/              App forms (.xlsx source -> .xml compiled)
  data/                   Northern facility list (referral destinations) and hand-verified fixes
  tools/                  Form generators (forms written as code)
  test/unit/              Fast unit tests (no browser)
  test/tasks|forms|...    Behaviour tests in the CHT test harness (headless browser)
referral_arrival/         Module 2 arrival server: facility code confirmation and escalation
voice/                    Module 4 caregiver replies, recording rules, Akan speech tools (off)
shared/household_link/    Shared household record: platform IDs linked to CHT and MAMA-AI by reference
shared/module5/           Module 5 aggregate export file for DHIS2 / DHIMS-2
shared/languages/         Northern languages: registry, translation rules, translators' workpack, coverage
integration/              DHIS2 push (dry-run unless configured)
sms/                      SMS reminders (dry-run by default)
prototype/                Status board, built from the repo (nothing approved)
docs/                     Roadmap, security review, outreach pack, pitch
```

MAMA-AI (facility referral ranking) is a separate repository, `ZziemWellu/mama-ai-platform`; do not
clone it inside this one.

`cht-app/` started as a copy of `config/default` from cht-core **5.3.1** (AGPL-3.0).

### Referral destinations (`data/northern_facilities.csv`)

277 referral-level facilities (hospitals, polyclinics, health centres, clinics) in the five
northern regions, built by `tools/build_facilities.py` from:

- "Health Facilities in Sub-Saharan Africa" (Maina et al., WHO / KEMRI-Wellcome) on HDX: public
  (MoH) and faith-based facilities, geocoded, pre-2019 region names.
- geoBoundaries Ghana regions (2021, OSM, CC BY-SA 2.0) and districts (2019, Ghana Statistical
  Service via USAID, CC BY 4.0), to assign each facility its current region and district.

MAMA-AI's OpenStreetMap-derived list was not used: it had only 51 northern entries, including
non-clinical ones, and missed the main referral hospitals.

**Limits:** the list predates 2019, has no private facilities, and does not say which facilities
offer caesarean section or blood transfusion. Source coordinates can be wrong (Tamale Teaching
Hospital was placed in Savannah); fixes go in `data/facility_corrections.csv` with a reason.
The list needs checking by each Regional Health Directorate before emergency routing relies on it.

## Setting up a machine

Needs: Node.js 20+ (22 used), Python 3.10+, Git, and `xsltproc` (libxslt).

- **Linux / macOS:** install `xsltproc` from the package manager (`apt install xsltproc`, already on macOS).
- **Windows:** `xsltproc` isn't built in. This project used MSYS2's `mingw-w64-x86_64-libxslt`
  package and its DLLs, copied into a folder on the PATH (see "Windows notes" below) - or, with no
  admin rights available, conda's `libxslt` package works just as well (same section).

```bash
cd cht-app
npm ci
pip install openpyxl numpy scipy pytest "git+https://github.com/medic/pyxform.git@medic-conf-1.17#egg=pyxform-medic"
```

`numpy`/`scipy` are the nutrition module's optimiser (`nutrition/optimiser`), and `pytest` runs
both `cht-app/tools`'s and `nutrition`'s test suites - all three are imported by the code even
though they're easy to miss since nothing under `cht-app/` itself requires them.

## Everyday commands (from `cht-app/`)

```bash
npm run build          # regenerate every platform form and compile app settings: run after ANY change
npm run build-pilot    # the pilot app (Modules 1 + 5 + raising a referral) in .pilot-build/; see cht-app/modules.js
npm run demo-seed -- --url=...   # load the synthetic Kumbungu demo district (docs/pitch/DEMO_SETUP.md)
npm run test-unit      # ranking, facility data, integrity checks: seconds
npm test               # everything in the CHT harness (about 15 minutes on a slow laptop)
cd tools && python -m pytest -q    # form generators, pilot warning, emergency routing
```

GitHub Actions runs all of this on every push, and fails if the committed forms or settings differ
from what their sources generate (`.github/workflows/ci.yml`).

The test harness reads the **compiled** `app_settings.json`, not `tasks.js`. If a rule change
seems to have no effect in tests, you forgot to compile.

## Running a full CHT server (for demos)

Needs Docker and a machine with at least 8 GB RAM. Follow the CHT docs for a local instance
("CHT Docker Helper"), then upload this config:

```bash
npm run build-pilot -- --url=https://medic:<admin password>@localhost:10443
npm run demo-seed -- --url=https://medic:<admin password>@localhost:10443 --nurse-password=<password> --insecure
```

The second command loads the demo district: three CHPS zones in Kumbungu, their nurses and 13 women
with histories, all made up (`docs/pitch/DEMO_SETUP.md`). The five-minute demo script is
`docs/pitch/DEMO_SCRIPT.md`; `node demo/walkthrough.js` checks every step of it in the real app and
can record a two-minute video. Change the default admin password before exposing a server.

Use only made-up data. Real health data must stay in Ghana or on GHS-controlled servers.

**Pitch and outreach:** `docs/pitch/` (one-page summary, demo, costing, screenshots) and
`docs/outreach/` (institutional home, letters, pilot evidence plan, registration and ethics checklists).

## Windows notes

Install Node.js, Python and Git normally; nothing in the repo depends on where they are installed.
For `xsltproc`, either install MSYS2's `mingw-w64-x86_64-libxslt` package and put its `bin` folder
on the PATH, or use conda (below).

**No admin rights, so no MSYS2/Chocolatey?** If conda or miniconda is already installed,
`conda install -n base -c conda-forge libxslt` puts a working `xsltproc.exe` in its `Library\bin`
without needing an administrator account - unlike Chocolatey's default (machine-wide) install
location. Add that folder to PATH, e.g. in Git Bash's `~/.bashrc`:

```bash
export PATH="/c/Users/<you>/miniconda3/Library/bin:$PATH"
```

Verify with `xsltproc --version`; the rest of the build (`npm run build`, `pyxform-medic`) doesn't
care which of the two installs put it on PATH.

## Licence

AGPL-3.0, inherited from the CHT. Changes served to users must be published as open source.

## SMS reminders (sms/)

Sends reminder texts to pregnant women about a clinic visit, a birth plan or a referral. Texts are
deliberately non-clinical: they never name a condition, a sign or a dose.

- **Dry run by default.** Nothing is sent unless `SMS_LIVE=1` and `ARKESEL_API_KEY` are both set.
- Cannot re-send the same reminder, cannot text anyone who replied STOP, cannot exceed `SMS_MAX_PER_RUN`.
- Cost estimate: `node sms/budget.js --women 500 --messages-per-woman 6` (GHS 60-240 for 3,000 texts).
- Before any live send: register the pilot as a data controller with the Ghana Data Protection
  Commission (Data Protection Act 2012, Act 843), and have the reviewer approve every template.

