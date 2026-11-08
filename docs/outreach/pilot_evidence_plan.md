# Pilot evidence plan: what the six weeks must show

Written for: the project lead, the clinical advisor, the research partner and the ethics committee.
It turns the field test in `docs/PILOT_PLAN.md` section 4 into the evidence a district or a funder
will ask for, and says how each figure is produced. It is a process evaluation: it shows whether
nurses can use the tool and whether it does what it should. It does not measure health outcomes.

## Questions the pilot answers

1. **Can nurses use it on their own phones?** Time per task against paper; errors; requests for help;
   usability score; data and battery use; offline use.
2. **Does it act on danger signs?** Danger signs found; emergencies referred; minutes from finding to
   referral; emergencies not referred, each reviewed.
3. **Does it keep newborn visits on time?** Share of newborns visited by day 1.
4. **Can the paper tally stop?** Does the monthly Module 5 file match a hand count of the same records?
5. **Would the district keep it?** The DHD's and the nurses' own answer, in their words.

## Where each figure comes from

| Figure | Source | How |
|---|---|---|
| Registrations, visits, danger-sign checks and results, referrals, births | The app's records | `node shared/pilot_metrics/report.js --url=... --from=... --to=...` (per nurse and in total) |
| Minutes from an emergency to its referral; emergencies not referred | The app's records | Same report; every emergency without a referral within a day is listed by name for review |
| Newborns visited by day 1 | The app's records | Same report |
| Monthly file matches a hand count | Module 5 file and a hand count | Run `shared/module5/from_cht.js` for the month; an observer counts the same reports by hand; compare every cell |
| Time per task, app and paper | Observer with a stopwatch | `PILOT_PLAN.md` section 4 table; three repetitions per task per nurse |
| Errors and requests for help | Observer's sheet | Tally per task; describe each error |
| Usability | System Usability Scale, below | Each nurse, end of week 1 and end of week 6 |
| Data and battery use | Each phone's settings | Record at the start and end of each week |
| Hazards | Hazard log | Every dangerous or near-dangerous event: what, severity, fix, retest |
| Nurses' and the district's views | Short interviews, below | End of the pilot |

## Timeline (six weeks)

| Week | What happens |
|---|---|
| 0 | Training (half a day). Baseline: time the same tasks on paper. Record phones (make, Android version, RAM, storage). |
| 1 | Training data only. Observer present. Usability score at the end of the week. |
| 2-5 | Use alongside the registers, on training data unless the district, ethics and clinical sign-off allow more. Weekly pilot report. Observer two days a week. |
| 6 | Final timings, usability score, interviews, Module 5 comparison, final report. |

## Usability: System Usability Scale (SUS)

Ten statements, answered 1 (strongly disagree) to 5 (strongly agree). It is a standard, free
questionnaire (Brooke, 1996; "system" is replaced by "app" here), so results can be compared with other tools. Read it aloud and
translate if the nurse prefers; note when you did.

1. I think that I would like to use this app frequently.
2. I found the app unnecessarily complex.
3. I thought the app was easy to use.
4. I think that I would need the support of a technical person to be able to use this app.
5. I found the various functions in this app were well integrated.
6. I thought there was too much inconsistency in this app.
7. I would imagine that most people would learn to use this app very quickly.
8. I found the app very cumbersome to use.
9. I felt very confident using the app.
10. I needed to learn a lot of things before I could get going with this app.

**Scoring:** odd items, score minus 1; even items, 5 minus score; add the ten, multiply by 2.5. The
result is 0-100. Around 68 is average across published studies; report each nurse's score and the
median, not just the mean.

## End-of-pilot interview (10 minutes per nurse)

1. Which part of your day did the app make easier? Which part harder?
2. Tell me about a time the app's advice surprised you. What did you do?
3. Did you keep paper alongside it? Which registers, and why?
4. What would make you stop using it?
5. What would you change first?

For the DHD: would you keep it after the pilot, and on what conditions?

## The pilot report

One page of results, then the tables. Report every figure with its count ("4 of 5 nurses", not "80%"
alone), every hazard and every emergency not referred, and what was changed because of them.

**Do not claim:** lives saved, outcomes improved, or cost savings. Five nurses for six weeks cannot
show those. Say what was measured and how.

## Before the pilot starts

- Clinical advisor sign-off of Module 1 and the referral form (`clinical_signoff.json`).
- The district's written agreement (`district_agreement_mou_draft.md`).
- Ethics approval, or the committee's written view that this is service evaluation (`ethics_pack_outline.md`).
- The Ghana-hosted server; DPC registration before any real person's data.
- A rehearsal of every measure on the demo district: `npm run demo-seed`, then the report above.
