# Pilot plan: Modules 1 and 5 in Kumbungu

Written for: the project lead, the clinical advisor, and the Kumbungu District Health Directorate.
Decided 8 November 2026. Nothing here is approved clinical content; sign-off lives in
`clinical_signoff.json`.

## 1. Decisions

1. **No new modules.** Engineering effort goes to the pilot's two modules and to Phase 0. Modules 2
   (arrival tracking), 3, 4, 6 and 7 stay in the code, tested, and out of the pilot build.
2. **The pilot is Module 1 and Module 5, plus raising a referral.**
   - Module 1 (risk before crisis) is the core: the ranked task list, newborn visits, the maternal
     danger assessment.
   - Module 5 (the district report) is the adoption gate: the district adopts only if the tool produces
     the report it already files, so a paper tally can stop.
   - Raising a referral stays in: Module 1's danger assessment hands every emergency to the referral
     form. A strict 1 + 5 build would drop the action a danger sign leads to.
3. **Exact counts go to DHIMS-2; small numbers are hidden only in public** (`shared/public_counts`). The
   district HMIS officer confirms this in writing (`ECHIS_ACCESS_GUIDE.md`, question 7).
4. **Modules 2 (arrival loop), 6 and 7 join only after clinical sign-off** of the pilot modules and a
   passed field test.

## 2. What the pilot build contains

Built with `cd cht-app && npm run build-pilot` (see `cht-app/modules.js`; a unit test fails if any task,
target or form has not been assigned to a part). The committed app remains the full build.

| | In the pilot |
|---|---|
| Tasks (12) | cht-core's pregnancy and postnatal tasks; newborn home visits (day 1, 3 if switched on, 7, week 6); maternal danger follow-up; newborn danger-sign follow-up; **raise a referral** |
| Targets (9) | cht-core's pregnancy, birth and death targets; referrals raised |
| App forms (14) | pregnancy, home visit, facility reminder, danger sign and follow-ups, delivery, postnatal visit, maternal danger assessment, referral, death report, replace user |
| Module 5 | `shared/module5/from_cht.js` counts the month's reports per CHPS zone; `shared/module5/cli.js` writes the DHIS2 import file |
| Not in the pilot | arrival tracking (referral follow-up), barrier screen, birth plan, feeding counselling, market prices, voice question, sick child, SMC |

## 3. Phase 0: people, not code (blocks the pilot)

| # | Step | Owner | Done when |
|---|---|---|---|
| 0.1 | **Name a clinical advisor** (midwife or public-health physician, Northern Region). Every module waits on this. Role description: `docs/outreach/clinical_advisor_role.md` | Project lead | Name and written acceptance in `clinical_signoff.json` (`designated_reviewer`) |
| 0.2 | Clinical review of Module 1 and the referral form against GHS protocols (`CLINICAL_CONTENT.md`, `CLINICAL_REVIEW_BRIEF.md`), including the open questions in `docs/CODE_REVIEW_2026-11-07.md` | Clinical advisor | Module 1 `approved: true` with name and date |
| 0.3 | Register the not-for-profit | Project lead | Certificate |
| 0.4 | Data Protection Commission registration (`docs/outreach/dpc_registration_checklist.md`) | Project lead | Registration number |
| 0.5 | District agreement naming the paper registers the pilot retires (`docs/outreach/district_agreement_mou_draft.md`) | Project lead, DHD | Signed MOU with Schedule 2 filled in |
| 0.6 | DHIMS-2 data-element UIDs, org-unit UIDs and the small-number rule confirmation (`ECHIS_ACCESS_GUIDE.md`) | Project lead, HMIS officer | `config/dhis2.json` has no TODO; written confirmation |
| 0.7 | Ethics review with a research partner (`docs/outreach/ethics_pack_outline.md`) | Project lead | Approval letter |
| 0.8 | Ghana-hosted CHT server (`docs/outreach/quote_request_*.md`) | Project lead | Server running, backed up, inside Ghana |
| 0.9 | Map each Module 5 measure to a DHIMS-2 data element and its definition (`MEASURES` in `from_cht.js` are drafts) | HMIS officer, developer | Mapping file reviewed by the HMIS officer |
| 0.10 | **Dagbani:** a translator and a separate checker from Kumbungu translate and back-translate the 12 client-facing texts (`docs/LANGUAGES.md` section 4); the clinical advisor approves the emergency ones. The DHD confirms Kumbungu's language list | Project lead, DHD, clinical advisor | `node shared/languages/coverage.js --district=Kumbungu` shows 12 usable |

## 4. Field test: five nurses, Kumbungu, their own phones

**Who:** five CHPS nurses or CHWs from Kumbungu who keep the registers the pilot would replace.
**Devices:** the phones they actually carry (record make, model, Android version, RAM, free storage).
Do not lend better phones: the test is whether *their* phones cope.
**Data:** training data only, on the Ghana-hosted server (Phase 0.8). No real patient before sign-off.

### What to measure

For each nurse, each task, three repetitions, timed with a stopwatch by an observer who does not help.

| Measure | How | Proposed limit (replace with the blueprint's figures) |
|---|---|---|
| First login and sync on 3G | From tapping "Log in" to the task list showing | 2 minutes (indicative runs: 33 s emulated, 127 s Android emulator; `docs/E2E_RUN.md`) |
| Morning task list: find the most urgent visit | From opening the app to opening the right task | 30 seconds |
| Register a pregnancy | Form start to submit | 5 minutes |
| Maternal danger assessment | Form start to submit, with BP and temperature | 4 minutes |
| Newborn day-1 visit | Form start to submit | 5 minutes |
| Raise a referral from a danger sign | From the task to submit | 2 minutes |
| Monthly district report | From "start" to the import file, compared with the same month on paper | No hand tally; equal or fewer minutes than paper |
| Paper baseline | The same tasks on today's paper registers, timed the same way | Recorded, for comparison |

Also record: every error a nurse makes, every time she asks for help, offline use (airplane mode, then
sync), battery used in a half-day, and whether any form failed to open.

Language: record each nurse's own languages, and for each training client the language on her profile.
Note every time the nurse had to interpret, and whether a client understood the reply she was given. If
the Dagbani texts are not checked by the field test, run it in English with the nurse interpreting, and
say so in the results.

### Pass, fix or drop

- **Pass:** median times within the limits, no dangerous error (a missed or wrong danger-sign result,
  a referral that did not save), and the monthly file matches a hand count of the same reports.
- **Fix:** any limit missed by a small margin, or a confusing step. Fix and retest with the same nurses.
- **Drop:** a dangerous error that a fix cannot remove, or the report taking longer than paper.

Record results in a hazard log per release: what happened, severity, fix, retest.

How each figure is produced, the usability questionnaire and the pilot report:
`docs/outreach/pilot_evidence_plan.md`. The app-side figures come from
`shared/pilot_metrics/report.js`; rehearse it on the demo district (`docs/pitch/DEMO_SETUP.md`).

## 5. After the pilot passes

In this order, each with its own sign-off and field test: Module 2 arrival tracking (needs the
Ghana-hosted referral server and SMS), Module 6 barriers, Module 7 sick child and SMC.
