# Clinical review brief for the Regional Director of Health

**Purpose.** To help the reviewer check the platform's clinical content against Ghana Health Service
protocols. **This brief approves nothing.** Sign-off is the reviewer's own act, recorded per module
in `clinical_signoff.json`. Until then every module shows the PILOT warning.

**Status:** nothing is signed off. Pilot district proposed: Kumbungu (see the end of this brief).

## 1. What the reviewer is asked to check

For each module, confirm or correct the rules in `CLINICAL_CONTENT.md`, then sign off that module.

| Module | Check | Where |
|---|---|---|
| 1 | Newborn visit days 1, 3, 7 and week 6; task order | `cht-app/priority.js`, `cht-app/tasks.js` |
| 1 | Maternal danger thresholds: severe hypertension >= 160/110; pre-eclampsia >= 140/90 with a symptom; PPH > 500 mL; fever >= 38.0 C; labour >= 12 h | `cht-app/tools/build_maternal_danger_assessment.py` |
| 2 | Referral severity and deadlines (emergency 1 day, urgent 2, routine 7); emergencies to hospitals only | `cht-app/tools/build_referral_forms.py` |
| 2 | Facility list and capability (no caesarean or transfusion data yet) | `cht-app/data/northern_facilities.csv` |
| 6 | Barrier questions; new rule: barrier open from 28 weeks, ranked 88 | `cht-app/tasks.js` (`barrier.unresolved_late`) |
| 7 | Sick-child danger signs and fast-breathing cut-offs | `cht-app/tools/build_child_forms.py` |
| 7 | SMC schedule: 4 cycles, 28 days apart, ages 3-59 months | `cht-app/tools/build_child_forms.py` |
| SMS | Reminder texts (non-clinical; need Twi translations and checking) | `sms/templates.js` |

## 2. What the research found

- **Ghana Standard Treatment Guidelines.** A 2017 edition is published by the Ministry of Health
  (`https://www.moh.gov.gh/wp-content/uploads/2020/07/GHANA-STG-2017-1.pdf`). A newer edition was not
  found in the search. **Action for the reviewer:** confirm which edition is current and check every
  threshold against it.
- **Postnatal care gap.** The 2022 Ghana Demographic and Health Survey found only 52% of newborns had a
  postnatal health check. This supports the newborn visit schedule.
- **Newborn danger signs.** Maternal knowledge of newborn danger signs is low in Ghanaian studies, so
  the danger-sign content is needed, but it must be taught as well as checked. Source:
  `https://pmc.ncbi.nlm.nih.gov/articles/PMC4474560/`.
- **Transport and money.** Transport is not covered by NHIS, and in Kassena-Nankana it made up about
  32% of family spending on maternal complications. This supports the barrier screen. Source:
  `https://www.ncbi.nlm.nih.gov/pmc/articles/PMC5700011/`.
- **Reminders work.** Cluster trials in Zanzibar and Lagos found more ANC attendance with mobile
  reminders. Sources: `https://pmc.ncbi.nlm.nih.gov/articles/PMC9585595`, `https://www.ncbi.nlm.nih.gov/pmc/articles/PMC3898378/`.
- **Risk prediction.** The PIERS-ML pre-eclampsia model was validated across 11 low- and middle-income
  countries (`https://www.thelancet.com/journals/landig/article/PIIS2589-7500(23)00267-4/fulltext`). The
  platform's rules are not that model. Do not present them as validated.

## 3. Questions only the reviewer can answer

1. Which Ghana STG edition applies, and do the thresholds in section 1 match it?
2. Is the 32-week birth-plan deadline GHS policy, or a project choice?
3. Should the barrier ranking (level 88) sit where it does against newborn day 1 and sick-child day 3?
4. Who in the district delivers Twi reminder texts, and who checks the translations?
5. Which facilities can actually provide caesarean or blood transfusion? The data does not say.

## 4. Pilot district: recommendation

**Kumbungu** is proposed for these reasons from the research:
- It is reported as a **System Learning District**, a centre for disseminating GEHIP systems strategies.
  *Verify before relying on it: this came from a search summary, and the originating page was not
  confirmed (a candidate is `https://pmc.ncbi.nlm.nih.gov/articles/PMC12863559/`).*
- Kumbungu District Hospital is listed among the Northern hospitals, and the platform's facility data
  already includes Kumbungu Health Centre.
- Gushegu (100% of CHPS zones trained) and Yendi (93%) are alternatives. Yendi's report describes
  fragmented coordination, which makes a pilot harder.
- **Not verified:** distance from Tamale and road access. Check before committing.

The district choice still needs the partner's agreement. Nothing here is agreed with them.
