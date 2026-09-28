# Northern Ghana Community Health Platform

Offline-first community health modules for Ghana's five northern regions (Northern, Savannah,
North East, Upper East, Upper West), built on the [Community Health Toolkit](https://communityhealthtoolkit.org) (CHT).
Each module can ship on its own or together with the others. The design is in the
[blueprint](https://claude.ai/code/artifact/5815704a-0659-4d4f-89b8-8d14b7349c42).

| Module | Status |
| --- | --- |
| 1 Risk before crisis | In progress: urgency ranking of the task list, newborn home visits (day 1, 3, 7) |
| 2 Last-mile follow-up | Not started (MAMA-AI's referral code will move here) |
| 3 Local-food nutrition | Not started |
| 4 Voice support | Not started (MAMA-AI's Twi audio pipeline will move here) |
| 5 CHPS workflows | Not started |
| 6 Hidden barriers | Not started |
| 7 Sick child and prevention | Not started |

> **Not for clinical use.** Clinical rules (danger signs, visit timing, priorities) follow WHO-based
> reference content and must be confirmed against Ghana Health Service protocols by a clinical
> advisor before any field use. See `cht-app/priority.js` and `cht-app/tools/build_pnc_home_visit.py`.

## Layout

```
cht-app/                  CHT app configuration (forms, tasks, targets, translations, tests)
  priority.js             Module 1: one urgency ranking for the whole task list
  tasks.js                Task rules (reference tasks + Module 1 newborn visits)
  forms/app/              App forms (.xlsx source -> .xml compiled)
  tools/                  Form generators (forms written as code)
  test/unit/              Fast unit tests (no browser)
  test/tasks|forms|...    Behaviour tests in the CHT test harness (headless browser)
```

`cht-app/` started as a copy of `config/default` from cht-core **5.3.1** (AGPL-3.0).

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
npx mocha test/unit                          # fast unit tests, seconds
npx cht --no-check compile-app-settings      # REQUIRED after changing tasks.js / targets.js / priority.js
npm run test-tasks                           # task behaviour tests (headless browser)
npm test                                     # everything (about 15 minutes on a slow laptop)
python tools/build_pnc_home_visit.py && npx cht --no-check convert-app-forms -- pnc_home_visit
```

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
