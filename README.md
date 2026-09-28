# Northern Ghana Community Health Platform

Offline-first community health modules for Ghana's five northern regions (Northern, Savannah,
North East, Upper East, Upper West), built on the [Community Health Toolkit](https://communityhealthtoolkit.org) (CHT).
Each module can ship on its own or together with the others. The design is in the
[blueprint](https://claude.ai/code/artifact/5815704a-0659-4d4f-89b8-8d14b7349c42).

| Module | Status |
| --- | --- |
| 1 Risk before crisis | In progress: urgency ranking, newborn home visits (day 1, 3, 7), maternal danger assessment with explained rules |
| 2 Last-mile follow-up | In progress: tracked referrals with code, destination and deadline; arrival follow-up; supervisor targets. SMS confirmation by facilities needs a live server (not built yet) |
| 3 Local-food nutrition | In progress: nutrition engine (`nutrition/`) with checked prices, balanced least-cost plans and a nutritionist approval gate; CHT feeding counselling (approved plans only, dietary diversity) and market price forms. No plan approved yet |
| 4 Voice support | Not started (MAMA-AI's Twi audio pipeline will move here) |
| 5 CHPS workflows | Not started |
| 6 Hidden barriers | In progress: barrier screen with an action per barrier, birth plan with the decider (by 32 weeks), same-day barrier check after a missed referral, supervisor target |
| 7 Sick child and prevention | In progress: iCCM sick-child assessment (malaria, pneumonia, diarrhoea, danger signs) with day-3 follow-up, SMC dose tracking with catch-up and home-dose checks. Vaccine defaulter tracking not started |

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
```

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
  package and its DLLs, copied into a folder on the PATH (see "Windows notes" below).

```bash
cd cht-app
npm ci
pip install openpyxl "git+https://github.com/medic/pyxform.git@medic-conf-1.17#egg=pyxform-medic"
```

## Everyday commands (from `cht-app/`)

```bash
npm run build          # regenerate every platform form and compile app settings: run after ANY change
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
npx cht --url=https://medic:password@localhost:10443 --accept-self-signed-certs
```

Use only made-up data. Real health data must stay in Ghana or on GHS-controlled servers.

## Windows notes (the first development laptop)

Tools live outside the repo in `C:\Users\Owner\.devtools\` (Node, Python, gh, xsltproc). Put these
on the PATH before running commands:

```bash
export PATH="/c/Users/Owner/.devtools/xslt:/c/Users/Owner/.devtools/python-3.11:/c/Users/Owner/.devtools/node-v22.23.2-win-x64:$PATH"
```

On a new machine, install the tools normally instead; nothing in the repo depends on those paths.

## Licence

AGPL-3.0, inherited from the CHT. Changes served to users must be published as open source.
