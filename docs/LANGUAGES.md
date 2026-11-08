# Local languages in the five northern regions

Written for: the project lead, District Health Directorates, translators and reviewers, and the developer.
Last updated 8 November 2026.

## 1. Why this matters, and what was wrong

The pilot district, Kumbungu, speaks **Dagbani**. Until now the platform's only local language was
**Twi**, which is not the language of any northern district. Its Twi texts were unchecked first drafts:
the emergency reply said *nnɛ* ("today") where the English says "now". The CHT app offered cht-core's
default languages (Hindi, Nepali, Swahili and others), and no northern language at all.

A mother who cannot read the reminder or understand the reply gets nothing from the platform. So each
client's language is now part of her record, and every client-facing text is built to be delivered in it.

## 2. What changed in the platform

| Where | What it does now |
|---|---|
| Person forms (create and edit) | Ask which language the person speaks best (required) and which others they understand. The list comes from `shared/languages/languages.json`, with Dagbani first. |
| Profile | Shows "Language: Dagbani; also understands Hausa", or asks for it if it was never recorded. The nurse knows which language to use, or that she needs an interpreter. |
| SMS reminders | Sent in her language when a checked translation exists; otherwise in English. Each message records its language, and each run reports how many fell back to English. |
| Voice replies | Same rule. The offline voice question form shows the English reply plus checked translations in her languages. With no checked translation, it tells the CHW to interpret the English word for word. |
| Speech recognition | Each model declares its language. The only model today is Akan, so it is never run on Dagbani audio; the caller gets the safe "call your CHW" reply instead of a misheard one. |
| The nurse's own screens | English only. Nurses work in English, and the cht-core languages nobody here uses are switched off. |

### The rules (`shared/languages/index.js`)

1. A client gets a translation only in a language **she** listed. Nothing is guessed from her district,
   so a Dagbani speaker is never sent Twi because Twi happens to be translated.
2. Only checked text is sent:
   - **checked**: a second native speaker, not the translator, has back-translated it, and the meaning matched;
   - **approved**: the clinical advisor has signed it off.

   Drafts are never sent.
3. A translation is tied to the English it was made from. If the English changes, the translation is
   **stale** and is not used until someone checks it again.
4. Otherwise she gets English, and the record says so. The gap is counted, not hidden.

## 3. Languages by region

From published sources. **Each District Health Directorate confirms its own list before its district
joins.** The tiers set the order of work:

- **Tier 1:** needed for the Kumbungu pilot.
- **Tier 2:** a region's main language, needed before that region joins.
- **Tier 3:** served by a CHW or interpreter until speakers and reviewers are found.

| Region (capital) | Tier 1-2 languages | Tier 3 languages |
|---|---|---|
| Northern (Tamale) | **Dagbani** (Kumbungu, Tolon, Tamale, Savelugu, Yendi and others), Likpakpaanl (Saboba, Zabzugu and others), Hausa (towns) | Nawuri, Chumburung, Ntcham, Fulfulde, Twi (migrants) |
| Savannah (Damongo) | Gonja | Tampulma, Vagla, Hanga, Deg, Safaliba, Birifor, Fulfulde |
| North East (Nalerigu) | Mampruli, Bimoba, Likpakpaanl | Anufo (Chereponi), Fulfulde |
| Upper East (Bolgatanga) | Gurene (Farefare, Frafra, Nankani), Kusaal (Bawku), Kasem (Navrongo), Buli (Builsa) | Bisa, Talni, Mooré, Fulfulde |
| Upper West (Wa) | Dagaare, Sisaali (Tumu), Wali (Wa) | Birifor, Chakali, Lobi, Fulfulde |

Notes:
- **Hausa** is listed as a lingua franca. A client is sent Hausa only if she says she understands it.
- **Dialects.** Nanuni (Nanumba) is close to Dagbani, and Northern Dagaare (Lawra, Nandom) to Dagara.
  Ask speakers before reusing text across them.
- **Talni** has no confirmed ISO code. It is recorded as `talni` until checked.
- **Fulfulde.** Pastoral Fulani households live in all five regions and are often missed. Each district
  should say how it reaches them.

See the current list and coverage:

```
node shared/languages/coverage.js --district=Kumbungu
node shared/languages/coverage.js            # every tier 1 and 2 language
```

## 4. How a text gets translated and checked

Each text goes through four people:
1. **Translator:** a native speaker from the district, ideally a health worker.
2. **Checker:** a second native speaker from the same district, who did not translate it.
3. **Project lead:** compares the back-translation with the English.
4. **Clinical advisor:** for clinical texts (the emergency reply, the danger-sign words).

The steps:

1. **Export the workpack.** `node shared/languages/workpack.js export --lang=dag --out=dag_workpack.csv`
   produces one row per text, giving the English, what it is for and the rules to keep. Open it in Excel
   or LibreOffice; it is UTF-8 with a byte-order mark, so ɛ, ɔ and ŋ display correctly.
2. **Translate.** The translator fills `translation` and `translator`, with status `draft`. Use the Bureau
   of Ghana Languages orthography. Write ɛ, not "3", and ɔ, not "c". For voice words, list the everyday
   ways people say each danger sign; too many is safer than too few.
3. **Back-translate.** The checker writes `back_translation` without seeing the English.
4. **Compare.** The project lead compares the two. If the meaning matches, set `checker`, `date` and
   status `checked`. If not, the text goes back to the translator.
5. **Import.** Run `node shared/languages/workpack.js import --lang=dag --in=dag_workpack.csv --dry-run`,
   then without `--dry-run`. Import is all or nothing. It refuses a file where:
   - a placeholder such as `{name}` or `{date}` is missing;
   - the word STOP is missing (the SMS gateway listens for it);
   - an SMS needs more than three parts;
   - a `checked` row is missing its checker, back-translation or date;
   - the file was made from older English.
6. **Rebuild the voice form:** `node voice/export_replies.js && cd cht-app && npm run build`.
7. **Clinical sign-off.** The clinical advisor signs off the clinical texts, which are then set to `approved`.

### SMS cost

Most northern orthographies use letters outside the basic SMS alphabet (ɛ, ɔ, ŋ, ɣ, ʒ, ɩ, ʋ). One such
letter switches the whole message to UCS-2, which holds 70 characters a part instead of 160. A local
reminder can therefore cost two or three times as much as the English one. The workpack warns at three
parts, and `languages.smsParts()` gives the count for the budget (`sms/budget.js`).

### Reading is not the only barrier

Many women in rural Kumbungu do not read, in any language. For them an SMS in Dagbani is still
unreadable. The routes that reach them are:
- the CHW reading or saying the reply on a visit (the voice question form);
- recorded audio of the checked text, spoken by a native speaker from the district.

Recorded audio is not built yet. Plan it once the Dagbani texts are checked. Do not use synthetic speech
for health messages until speakers have judged it intelligible.

## 5. Language technology that exists (listed by providers, not tested here)

| Resource | Northern languages listed | Use here |
|---|---|---|
| [Khaya / GhanaNLP](https://pypi.org/project/khaya/0.2.0/) | Translation and text-to-speech list Dagbani, Gurene and Kusaal; speech recognition lists Dagbani | First drafts only (machine output is always a `draft`); possibly audio. Pricing and terms are still unanswered (`docs/PLAN_CRITIQUE_AND_ROADMAP.md`). |
| [Mozilla Common Voice: Dagbani](https://datacollective.mozillafoundation.org/datasets/cmn2cy2su01iymm07xfr6ul2b) | Dagbani, v25: about 27.5 h recorded (16 h validated), 69 speakers, CC0 | Fine-tuning a Dagbani speech model |
| [University of Ghana corpus (Data in Brief, 2025)](https://www.ncbi.nlm.nih.gov/pmc/articles/PMC12301755/) | Dagbani and Dagaare (with Akan, Ewe, Ikposo): about 1,000 h each, about 100 h transcribed | Fine-tuning Dagbani and Dagaare models |
| [Google WAXAL](https://research.google/blog/waxal-a-large-scale-open-resource-for-african-language-speech-technology/) | Dagbani and Dagaare confirmed; the full list is in an image we could not read | The repo's Akan model came from WAXAL; check for Dagbani |
| [Bureau of Ghana Languages](https://gna.org.gh/2026/08/ghana-standardises-five-more-local-languages-to-preserve-cultural-heritage/) | Standard orthographies for Dagbani, Dagaare, Gonja, Kasem, Gurene and Kusaal; Kusaal, Likpakpaanl and Sisaali added in June 2026 | The spelling translators follow |

Speech recognition for Dagbani is **not** part of the pilot. If it is built later:
1. Fine-tune Whisper on Common Voice and the University of Ghana corpus.
2. Test it on caregiver phrases recorded in Kumbungu (`voice/eval/caregiver_phrases.json` shows the format).
3. Do not switch it on unless it hears every emergency phrase in the test set.

Until then the menu-first voice form, where the CHW picks the topic, works without it.

## 6. Order of work

1. **Pilot (Phase 0):**
   - find a Dagbani translator and a separate checker in Kumbungu;
   - translate and check the 12 texts;
   - the clinical advisor approves the emergency texts.

   Until this is done the pilot runs with English messages and the CHW interpreting, and the profile
   still records every client's language.
2. **Before each region joins:**
   - its District Health Directorates confirm their language lists;
   - its tier 2 languages go through section 4.
3. **Tier 3 languages:** when a speaker community and two reviewers are found. Meanwhile the CHW or an
   interpreter serves those clients, and the profile shows who needs one.

## 7. Questions for each District Health Directorate

1. Which languages do clients in your district speak? Which is most common in each CHPS zone?
2. Do your CHWs and nurses speak them? Where is an interpreter needed?
3. Who could translate, and who could check, for health messages? Ideally health workers who are native
   speakers.
4. How do you reach Fulani households now?
