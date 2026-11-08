# Line-by-line review: voice, nutrition and household record (7 November 2026)

Written for: the project lead, the clinical advisor, the Twi reviewer and the nutritionist. It lists what
the code review fixed, and what only a person can settle. Nothing here is approved clinical content.

## Fixed in code

### Voice (Module 4)

| Problem | Fix |
|---|---|
| Speech recognition only heard the first 30 seconds: Whisper's input is cut at 30 s, so an emergency mentioned later in a long recording vanished | Audio is split into 30-second windows; each is transcribed (`transcribe_akan.py`) |
| A crash in speech recognition (no model, ffmpeg error) threw an error instead of answering | The caregiver gets the safe default reply; the audit line records the failure (`respond.js`) |
| No time limit: a hung model hung the caller | 120-second timeout on both transcribers (`transcribe.js`) |
| Twi output crashed `print()` on a console that is not UTF-8 | Output forced to UTF-8 |
| Danger signs from our own maternal danger assessment were not emergency words ("severe headache", "blurred vision", "fever", "water broke", "baby not moving"), and only one form of each word was listed ("bleeding" but not "bleeds") | Emergency list aligned with the assessment form, with inflections (`intents.js`) |
| "When should I feed the baby?" was sent to the clinic-date reply (first match won) | The topic with the most matching words wins; any emergency word still wins outright |
| An accent typed as a separate mark split a Twi word in two | Text normalised to NFC; accent marks kept |
| `replyFor('constructor')` returned an empty reply | Only real reply ids are used |
| Recordings never transcribed were never deleted from the server | Deleted `SERVER_MAX_DAYS` after arrival (`recordings.js`) |
| A stored quality consent of `"no"` counted as consent (a non-empty string is truthy) | Only the boolean `true` set at recording time counts |
| A recording without an id could be marked synced by mistake, and so deleted unsent | An id is required and must be unique |
| Choosing "Danger sign or emergency" in the voice form showed a reply and nothing else | The form tells the CHW to do the Maternal danger assessment (or Sick child assessment) now and refer |

### Nutrition (Module 3)

| Problem | Fix |
|---|---|
| The roadmap gate "prices no older than three months" was not enforced: a plan on July 2023 WFP prices could be approved | Each plan records `oldest_price_date`; `approve.py` refuses a plan whose prices are older than 92 days |
| A typo in `local_prices.csv` (food, region, season) was ignored without a word; a price of 0 made a food free | Every row is checked; a bad row stops the build with its line number |
| The "which prices to collect first" table crashed when a plan was infeasible | Infeasible cases are reported as no gain |
| A zero RNI divided by zero | Refused with a clear message |

### Household record

| Problem | Fix |
|---|---|
| A second CHT record for the same person silently replaced the first | Refused: it is a possible duplicate and must be flagged |
| A merge where both people had a CHT record lost one reference | Both kept (the second as an alias) |
| New links could attach to a person already merged away | References follow the merge to the surviving person (`resolve`) |
| An old duplicate in the queue could merge a person who had been merged since | Refused; flag again |
| A phone number written with spaces passed the "no phone numbers in a flag" check | Spaces, dashes and brackets are removed before the check |
| MAMA-AI login that returned no token left every later call unauthenticated | Error at login |
| An expired MAMA-AI token was never renewed | One fresh login and one retry, never a loop |
| The demo flag said "newborn feeding problem" while the demo referral request said postpartum haemorrhage | Both describe the same case |
| People created through the CHT adapter were stored as `type: contact`, which no app form accepts (found on a live CHT 5.3.1) | Uses `/api/v1/people`, which stores `type: person` |

## Needs a person (not fixable in code)

### Twi speaker, before any caregiver hears a reply

> **Update, 8 November 2026.** Twi is not the language of Kumbungu or any northern district; the pilot
> language is **Dagbani** (`docs/LANGUAGES.md`). The Twi drafts below have moved to
> `shared/languages/translations/twi.json` with status `draft`, so no caregiver hears them. They still
> need the corrections below before they can be checked and used for Twi-speaking clients.

1. **Emergency reply says "today", not "now".** English: "Go to the nearest health facility *now* ... call
   ... *right away*." Twi draft: "Kɔ ayaresabea a ɛbɛn wo ho *nnɛ* ... frɛ ... *nnɛ*." *Nnɛ* means today.
   An emergency instruction must not weaken in translation. Highest priority.
2. "Sɛ wontumi nantew a" reads as "if you cannot *walk*"; the English is "cannot travel".
3. The "unknown" reply opens "Me ho ayɛ wo"; check that it means "sorry" (a common choice is "Kafra").
4. The Twi emergency words (`mogya`, `ayaresa`, `mo nnhu`) and topic words: *ayaresa* (treatment) will send
   any mention of treatment to the emergency reply. Confirm or replace each word, and add the Twi for the
   danger signs now in the English list.
5. The 14 test phrases in `eval/caregiver_phrases.json` were written by the developer. Replace them with
   phrases collected from caregivers (with consent).

### Clinical advisor

1. Confirm the emergency word list in `intents.js`. It errs towards emergency (fever alone, any "blood").
2. The voice form never asks for *quality-check* consent, so `canListen` always refuses. That is the safe
   default; decide whether quality checks are wanted at all.
3. Decide whether a voice "emergency" should also create a task (today it shows an instruction only).

### Nutritionist

1. No plan can be approved until volunteers collect local prices (all WFP prices end in July 2023).
2. Iron and zinc adequacy treats plant and animal sources alike; absorption from cereal-based diets is
   lower. Decide whether to apply bioavailability factors before approving any plan.
3. `prepare.py` assumes 100% edible portion when the food table has no factor, and the energy column is
   read by position (`r[7]`), not by name. Check both the next time the table is rebuilt.

### Checked on a running CHT 5.3.1 (8 November 2026)

The CHT adapter created people with `POST /api/v1/person` and `parent` (PR #6). The request succeeds, but
CHT 5.3.1 stores that person as `type: "contact"` with `contact_type: "person"`, and every app form here
is offered only when `contact.type === 'person'`, so a person registered through the household link
would never be offered the pilot's forms. The adapter now uses `POST /api/v1/people` with `place`, which
stores `type: "person"`; confirmed against the server.
