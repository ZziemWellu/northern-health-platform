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
| 3 | Feeding plans (18 drafts), problem-nutrient wording and the referral direction | `nutrition/plans/REVIEW_PACK.md` (decision block per plan, recorded with `nutrition/record_decision.py`) |
| 4 | Caregiver question form (voice): topic replies in English and a first-draft Twi | `cht-app/tools/build_voice_forms.py`, `voice/replies.json` |
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

## 5. What is ready for the reviewer, and what is not

- **Feeding plans (Module 3).** Every plan is a draft. The review pack gives each plan its foods, the
  nutrient coverage, drafted referral and supplementation wording, and a decision block (approve,
  approve with changes, reject). A reviewer's decision is logged in `nutrition/plans/decisions.json`.
  Only an approval changes a plan, and only approved plans reach the feeding form. Iron, zinc, calcium
  and vitamin A are short in every plan with local foods at current prices; the wording says so and
  points to the GHS protocol. The reviewer must confirm the wording and name the product.
- **Caregiver question form (Module 2).** Offline, the CHW chooses the topic and the approved reply
  appears at once. The phone does not do speech recognition. Recordings are taken only with consent
  and kept for later transcription. **Decision needed:** how long recordings are kept, and who may
  hear them.
- **Twi wording** in both the SMS and the voice replies is a first draft. A Twi speaker from the
  district must check it.
- **Decisions taken by the developer, for the reviewer to confirm or overrule** (in `voice/recordings.js`):
  - *Recording kept how long:* on the phone, deleted once the server confirms it (never kept more than
    14 days if it never syncs). On the server, audio deleted 7 days after transcription. Only the topic
    is kept, never the words.
  - *Who can hear it:* nobody by default. A named quality reviewer may listen only if the caregiver
    also agreed to quality checks, and each listen is logged. Data protection law (Ghana's Data
    Protection Act 2012) has not been checked against this policy: the district data officer must.
  - *Module:* moved from module 2 to module 4 (voice support), following the blueprint's module
    numbering. Module 4 is a separate sign-off line from module 2.
- **Akan speech model:** `waxal-benchmarking/whisper-small-waxal-aka` (Apache-2.0 model, CC-BY-4.0
  data). Its card reports WER 31.7% on the WAXAL test set and says it is not for high-stakes use
  without validation. **Measured here** on 20 WAXAL validation clips (747 words): **WER 43.1%** before
  and **42.7%** after the repetition fix. One clip is still at WER 2.71: the model writes wrong words
  at a normal speaking rate, which neither the repetition rule nor a words-per-second check catches.
  A confidence-based filter is the next step and is not built. Treat the transcript as unreliable
  until the topic matching is tested on real caregiver phrases.
- **Topic matching** passes a drafted set of 14 caregiver-style phrases. The developer wrote that set,
  not caregivers, so it proves little until replaced with collected phrases. The Tɛkyerɛma TTS model is **not** used: its licence is non-commercial only (CC BY-NC).
- **On the phone:** the phone runs the offline topic menu and the offline recording queue. It does not
  run speech recognition. Akan recognition runs on the server when the phone syncs. A small on-phone
  model would need a separate validation first.
- **Not built:** the eCHIS link needs access that has not been granted (see `ECHIS_ACCESS_GUIDE.md`).
  The CHT Android app is built separately and is not changed here.
