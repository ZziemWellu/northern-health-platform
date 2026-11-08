# Running the demo

Written for: the project lead, and anyone who sets up the demo for a meeting.
**Synthetic data only.** The demo district, its people and its records are invented.

The demo is the pilot app (Modules 1 and 5, plus raising a referral) with a made-up Kumbungu
district: three CHPS zones (Dalun, Gbullung, Bontanga), each with a nurse, 13 women and their
histories over the last few months. The five-minute script is in `DEMO_SCRIPT.md`.

## What the demo contains

| CHPS zone | Nurse (login) | What is there |
|---|---|---|
| Dalun (demo) | Abiba Tahiru (`demo_nurse_dalun`) | The story the script walks through, below |
| Gbullung (demo) | Memunatu Fuseini (`demo_nurse_gbullung`) | Last month: a registration, a facility birth, an emergency (convulsions) referred to Tamale |
| Bontanga (demo) | Sakina Iddrisu (`demo_nurse_bontanga`) | Last month: two registrations, a home birth, a danger-sign check that found nothing |

Dalun, the zone the script uses:

| Woman | Her story |
|---|---|
| Ayishetu Mahama | Blood pressure 165/112 this morning: "Raise referral" is at the top of today's list |
| Sanatu Alhassan | Gave birth at home yesterday: her baby's first-day visit is on today's list |
| Fuseina Abukari | Dagbani speaker, about 30 weeks pregnant: use her for the live danger-sign check |
| Mariama Iddrisu | Not yet registered: register her pregnancy live |
| Rahinatu Yakubu | Aged 19, registered this month |
| Zenabu Sulemana | Facility birth 20 days ago; day-1 and day-7 newborn visits done |
| Hawa Wumbei | Fever last month (urgent); referred to Kumbungu Health Centre |

All women's language is recorded (Dagbani, some with English, Hausa or Twi as a second language).
Last month's reports produce a Module 5 file with rows for all three zones.

## Loading the demo (`npm run demo-seed`)

Run from `cht-app/`. The pilot app must already be on the server (`npm run build-pilot -- --url=...`).

```
npm run demo-seed -- --url=https://medic:<admin password>@<server> --nurse-password=<a password> [--insecure] [--remove-legacy]
```

- `--nurse-password` sets the password for all three demo nurse logins. Use letters and digits, at
  least 8 characters. You can set `NHP_DEMO_NURSE_PASSWORD` instead.
- `--insecure` is for the laptop's Docker server only (its certificate is self-signed).
- `--remove-legacy` also deletes old test data ("Demo District", the "E2E ..." district and the
  `e2e_chw` login). It was used once, on 8 November 2026.
- `--dry-run` shows what would change; `--reset-only` deletes the demo and stops.

It takes about two minutes. It fills every form through the real app forms (in the CHT test harness),
so each record has the fields the app itself writes. Then it checks that each nurse can log in and
writes last month's Module 5 file to `cht-app/.demo-out/`.

**Re-run it on the morning of every demo.** Dates are relative to the day it runs: Ayishetu's danger
check is "this morning", Sanatu's birth "yesterday". A re-run replaces the previous demo, including
anything recorded during an earlier demo. Seed during the day, not just after midnight.

**Safety.** The seeder refuses to run on a server that has anyone on it who is not demo or old test
data, so it cannot touch a real district's server. Every record it writes is tagged
`demo_seed: nhp-demo-kumbungu-v1`. Never seed the production (Ghana) server.

## Recording the walkthrough video (`demo/walkthrough.js`)

```
node demo/walkthrough.js --url=https://<server> --password=<nurse password> --record [--insecure]
```

It logs in as `demo_nurse_dalun` on a phone-sized screen and goes through the tasks, Fuseina's
profile, a danger-sign check, the referral, the targets and the Module 5 file, with captions. It
checks seven results on the way and fails if any is wrong, so it is also the demo's end-to-end test.
Output in `cht-app/.demo-out/walkthrough/`: screenshots, and `walkthrough.mp4` (about two minutes,
under 1 MB) with `--record` (needs ffmpeg). It changes the demo data, so **re-seed afterwards**.

The video has no sound. Add a voice-over if you want one (any video editor), or present it live.

## Sharing it

- **Live, from the laptop:** a Cloudflare quick tunnel gives the laptop's server a temporary public
  address with a valid certificate (no account, no domain). In PowerShell, and keep the window open:
  ```
  & "C:\Program Files (x86)\cloudflared\cloudflared.exe" tunnel --url https://localhost:10443 --no-tls-verify --http-host-header localhost
  ```
  It prints `https://<random words>.trycloudflare.com`; the address changes every time. Give that
  link and a **nurse** login, never the admin login. Works in Chrome on a phone and in the CHT
  Android app. The link dies when the window closes or the laptop sleeps.
- **Always on:** a small cloud server with a domain (for example with GitHub Student Developer Pack
  credit). Same commands, with that server's address.
- Logins and passwords are kept in the project lead's private notes, never in this repository.
- **Offline:** the video and the screenshots in `docs/pitch/screens/`.

## Pilot measures from the demo

`node shared/pilot_metrics/report.js --url=... --from=YYYY-MM-DD --to=YYYY-MM-DD` prints the table the
pilot will report (per nurse: registrations, danger signs found, emergencies referred and how fast,
newborn visits on time). On the demo it shows what the pilot's evidence will look like; the numbers
are not evidence. See `docs/outreach/pilot_evidence_plan.md`.

## Troubleshooting

| Problem | What to do |
|---|---|
| The app or the seeder fails with "Error loading design documents", or `{badmatch,{error,enoent}}` | The laptop's CouchDB lost track of a file after compacting. Run `docker restart northern_health-couchdb-1`. On 8 November 2026 automatic compaction was turned down on the laptop server to stop this (`[smoosh.ratio_dbs]` and `[smoosh.ratio_views]` `min_priority = 1000000`); it is caused by the Windows folder the data lives in. Do **not** copy that setting to a Linux server. |
| "Update available" pop-up | Click **Reload**. It appears after the app configuration is uploaded again. |
| A nurse's task list is empty just after logging in | Wait a minute for the first sync, then pull down to refresh. |
| The seeder says REFUSING | The server has people who are not demo data. It is not a demo server: stop. |
| A walkthrough check fails | Re-seed and run it again; if it still fails, the screenshot of that step shows what the app showed. |
