# Clinical content register

Everything in this platform that a clinician or nutritionist must check before field use, where it
lives, what it is based on, and its sign-off state. Sign-off is recorded per module in
`clinical_signoff.json`; until a module is signed off there by a named reviewer, every one of its
forms shows a **PILOT - NOT FOR PATIENT CARE** warning on its first page.

**Current state: nothing is signed off.**

## What to review, by module

| Module | Content | Where it lives | Based on | Deliberate choices to check |
| --- | --- | --- | --- | --- |
| 1 | Task ranking (16 levels) | `cht-app/priority.js` | WHO postnatal guidance: most newborn deaths in the first week | Emergency referral > danger-sign follow-up > urgent referral > unconfirmed referral > newborn day 1 > sick-child day 3 > ... |
| 1 | Newborn visit timing: day 1, 3, 7 (windows 0-2, 3-5, 6-10) | `cht-app/tasks.js` (`pnc.newborn_home_visit`) | WHO postnatal contacts | Windows don't overlap; a missed visit gives way to the next |
| 1 | Newborn and postnatal danger signs | `cht-app/tools/build_pnc_home_visit.py` | CHT reference forms (WHO-based) | A baby not seen triggers a next-day follow-up |
| 1 | Maternal danger rules and thresholds | `cht-app/tools/build_maternal_danger_assessment.py` | Ported from MAMA-AI, WHO-based | Severe hypertension >= 160/110 alone; pre-eclampsia signs >= 140/90 plus a symptom; PPH > 500 mL after birth; any bleeding in pregnancy; fever >= 38.0 C; prolonged labour >= 12 h; **no drugs or doses** |
| 2 | Referral severity and deadlines | `cht-app/tools/build_referral_forms.py` | Project design | Emergency 1 day, urgent 2, routine 7; an assessment's emergency can't be downgraded; **emergencies may only go to hospitals (levels 1-3)** |
| 2 | Referral destinations (277 facilities) | `cht-app/data/northern_facilities.csv`, `facility_corrections.csv` | WHO/KEMRI-Wellcome public facility list, pre-2019 | No caesarean or transfusion capability data; needs checking by each Regional Health Directorate |
| 3 | Nutrient targets | `nutrition/data/targets.json` | FAO/WHO 2004 RNIs (tables cited); energy 200/300/550 kcal **not yet confirmed from the primary WHO/PAHO source** | Breast milk not subtracted; adequacy threshold 70% |
| 3 | Portion limits | `nutrition/data/foods.json` | Planning assumptions | Replace with local intake data |
| 3 | Each feeding plan | `nutrition/plans/REVIEW.md` | Optimiser output | Approve per plan with `nutrition/approve.py` |
| 6 | Barrier screen questions and actions | `cht-app/tools/build_barrier_forms.py` | Project design; Upper East pilot (Jakubowski 2024) | "Who decides" is asked privately; NHIS "not sure" counts as a barrier |
| 7 | Sick-child danger signs and classifications | `cht-app/tools/build_child_forms.py` | WHO/UNICEF iCCM | Fever >= 7 d, cough >= 21 d, diarrhoea >= 14 d, blood in stool, red MUAC, under 2 months: refer; fast breathing >= 50 (2-11 mo), >= 40 (12-59 mo); fever with no RDT is urgent; **no doses** |
| 7 | SMC schedule | `cht-app/tools/build_child_forms.py`, `cht-app/tasks.js` | Ghana SMC practice (Ayamba 2025) | 4 cycles, 28 days apart; ages 3-59 months; catch-up next day when not at home |

## Known overlaps the reviewer should rule on

- **Two danger-sign forms for pregnancy.** The CHT reference `pregnancy_danger_sign` (symptoms only, for
  community workers) and this platform's `maternal_danger_assessment` (with blood pressure and
  temperature, for nurses) both exist. They should be split clearly by user role, or one retired.
- **Two newborn follow-up paths.** The reference delivery form creates danger-sign follow-ups for the
  baby; the platform adds routine day 1/3/7 visits. They are complementary but both appear on the list.

## How to sign off a module

1. The reviewer checks every row for that module against current GHS protocols, and records
   changes as code changes (each generator is plain Python).
2. Set `approved: true`, `by` and `on` for the module in `clinical_signoff.json`.
3. Run `npm run build` in `cht-app/`: the warning disappears from that module's forms.
