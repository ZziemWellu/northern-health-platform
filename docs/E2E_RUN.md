# End-to-end run on a real CHT server (8 November 2026)

Written for: the project lead and the developer. Until now every check ran inside the CHT test harness.
This run used a real CHT 5.3.1 server, the pilot build, and the app in a browser on an emulated
low-end phone and on an Android emulator. **Synthetic data only, on a local test server.** It is not the
field test in `docs/PILOT_PLAN.md` section 4: that needs five nurses on their own phones in Kumbungu.

## Set-up

| Part | What was used |
|---|---|
| Server | CHT 5.3.1 via the CHT Docker Helper (`cht-docker-compose.sh`), on the development laptop |
| App | The pilot build: `cd cht-app && npm run build-pilot -- --url=https://medic:password@localhost:10443 --remove-other-forms` |
| Data | A synthetic district, CHPS zone and household; a CHW user (role `chw`); one woman with a pregnancy registration, a maternal danger assessment with an emergency result (BP 165/112), and a home delivery the day before |
| Phone 1 | Chrome, headless, emulating a low-end Android phone: 360 x 640 screen, CPU slowed 6x, 1.6 Mbps down / 150 ms latency |
| Phone 2 | Android 15 emulator (x86_64, 2 GB RAM, 2 cores), Chrome 124, driven over its devtools socket |

## Results

### The pilot build reached the server intact

The upload replaced the full app with the pilot: 12 tasks, 9 targets, 14 app forms. The nine non-pilot
forms left on the server by an earlier full upload were removed (barrier screen, birth plan, feeding
counselling, market prices, referral follow-up, sick child and its follow-up, SMC dose and adherence).

### The task list is ranked as designed (both phones)

![Tasks on the Android emulator](e2e/android-tasks.png)

| Order | Task | Reason shown |
|---|---|---|
| 1 | Raise referral | Emergency: raise the referral now |
| 2 | Maternal danger sign follow-up | Danger sign found: follow up now |
| 3 | Newborn home visit | Newborn first day: most urgent routine visit |

This is Module 1's ranking (`priority.js`: 110, 100, 90) working on a real client, with the reason in
plain words on each row.

### Timings (synthetic data, local network: indicative only)

| Step | Emulated low-end phone | Android 15 emulator |
|---|---|---|
| Login page loads | 1.4 s | 6.8 s |
| First login to a working app (includes the forced password change on phone 1, and the first sync) | 33 s | 127 s |
| Tasks tab shows its list | 16 s | 37 s |

The server was on the same machine, so network time is understated, and the emulator runs x86 code on a
laptop CPU, not an ARM phone. Real figures come from the field test on the nurses' own phones over the
district's network.

### A bug found only on the real server: people created by the household link got no forms

The household link's CHT adapter created people with `POST /api/v1/person` (body with `parent`). CHT 5.3.1
accepts that, but stores the person as `type: "contact"` with `contact_type: "person"`. Every app form
here is offered only when `contact.type === 'person'`, so the nurse could not register a pregnancy or do
a danger assessment for her. The adapter now uses `POST /api/v1/people` (body with `place`), which stores
`type: "person"` (PR #16).

| Created by | "+" menu on her profile |
|---|---|
| Old adapter (`/api/v1/person`) | Death report only |
| Fixed adapter (`/api/v1/people`) | Death report, Delivery, Maternal danger assessment, Pregnancy registration, Referral |

![Menu for a person created by the old adapter](e2e/menu-person-created-by-old-adapter.png)
![Menu for a person created by the fixed adapter](e2e/menu-person-created-by-fixed-adapter.png)

No non-pilot form appeared on any profile.

### Module 5: CHT reports to a district file

`shared/module5/from_cht.js` read the month's reports from the server and counted the draft measures for
the CHPS zone; `shared/module5/cli.js` wrote an import-ready file with exact small counts and zeros:

```
pregnancy_registrations 1, deliveries 1, facility_deliveries 0, postnatal_home_visits 0,
maternal_danger_assessments 1, maternal_danger_emergencies 1, referrals_raised 0
```

CouchDB warned that no index matches the query, so it scans the database. That is fine at pilot scale;
add a Mango index on `type`, `form` and `reported_date` before district-wide use.

### Recording a client's language (added later on 8 November)

After the language fields were added (`docs/LANGUAGES.md`), the pilot build was uploaded again. The CHW
user opened a woman's profile, chose **Edit**, picked her languages and submitted:

- **The list:** 31 languages of the five northern regions plus "Other", with Dagbani first and English
  near the end.
- **What the server stored:** `preferred_language: "dag"` and `other_languages: "hau twi"` on her
  record, edited by the CHW user.
- **Her profile:** "Language: Dagbani (Dagbanli); also understands Hausa, Akan (Twi)".
- **A woman with no language recorded:** her profile says "Not recorded: edit the profile to add it".

The script set her date of birth and the languages programmatically. cht-core's edit form asks for the
date of birth again, and the synthetic record had none. The drop-down was not tapped by hand.

![The language questions on the edit form](e2e/language-edit-form.png)
![The language on her profile](e2e/language-profile.png)

## Not covered by this run

- **The nurses, their phones and their network.** That is the field test.
- **The "+" menu on the Android emulator.** The script opened it before the profile had loaded and hit
  the People list's button instead. The menu check above comes from phone 1, against the same server.
- **Filling and submitting forms in the app.** Reports were written to the server directly; the forms
  themselves are covered by the harness tests (`cht-app/test/forms`).
- **Offline use and sync after reconnecting**, battery and storage over a working day.
- **The CHT Android app** (the wrapper nurses would install). It refuses the test server's self-signed
  certificate; it needs the Ghana-hosted server with a real certificate.
- **The referral arrival server and SMS**: outside the pilot.

## Repeating it

1. Start the CHT Docker Helper; upload with `npm run build-pilot -- --url=... --remove-other-forms`.
2. Create a district, CHPS zone, household and `chw` user through the CHT API (`/api/v1/places`,
   `/api/v1/people`, `/api/v1/users`).
3. Add synthetic reports, log in as the user in a browser with mobile emulation (or Chrome on an Android
   emulator, with `adb forward tcp:9333 localabstract:chrome_devtools_remote`), and check the task order
   and each person's "+" menu.
4. Run `node shared/module5/from_cht.js --url=... --period=YYYYMM --org-units=... --out=counts.json`,
   then `node shared/module5/cli.js counts.json mapping.json YYYYMM out/`.
