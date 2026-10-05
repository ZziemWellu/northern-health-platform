# Free infrastructure and services to connect to now

Checked on 5 October 2026 against each provider's published terms. Terms change, so re-check before
relying on any of them. Free means free to use under the terms stated; none of these is a hosting
solution for real patient data.

## Use for development and demonstrations only (made-up data, no real people)

| Need | Option | What it gives | Limits to know |
|---|---|---|---|
| Public demo of the API and dashboards | Render free web services (current) | Runs the MAMA-AI services | Spins down when idle; about 40 seconds to wake; hosted in Oregon, not Ghana |
| Database for demos | Neon free Postgres (current) | Postgres with branches | Hosted outside Ghana; demo data only |
| Database for development | Local PostgreSQL in Docker | Full control | Needs the laptop; no public access |
| CHT server for end-to-end tests | GitHub Codespaces | Docker, so the CHT can run | Limited free hours each month; not for pilots |
| DHIS2 integration tests | play.dhis2.org demo | A real DHIS2 API with sample data | Sample data, resets; not Ghana's system |

## Messaging, for testing only

| Need | Option | Limits |
|---|---|---|
| SMS test sending | Arkesel: 10 free credits on sign-up, and an API sandbox that does not send to networks | Test with the team's own numbers only |
| SMS and voice sandbox | Africa's Talking sandbox | Delivers only to whitelisted test numbers; live use needs an account and a sender ID |

## Open source to self-host (free software, you pay only for servers)

| Software | Use | Notes |
|---|---|---|
| Community Health Toolkit (cht-core, AGPL-3.0) | Offline household and task core | Free; a digital public good; stewarded by Medic |
| DHIS2 (BSD-3-Clause) | The reporting system that DHIMS-2 runs on | Free; GHS owns the national instance |
| PostgreSQL, Python, Node.js, Next.js | Services and apps | Free |

## Ghana-hosted infrastructure (paid, quotes requested)

| Option | Status |
|---|---|
| NITA Primary Ghana National Data Centre (government cloud, hosting) | Quote requested; the most aligned with GHS |
| PAIX / RackAfrica, Accra (1.2 MW) | Quote requested |
| Digital Realty ACR2, Accra | Quote requested |
| Equinix, near Accra | Not requested yet; a fallback |

## Not suitable, and why

- **Oracle Cloud Always Free:** the nearest region is Johannesburg, and free ARM capacity there has been
  constrained in 2026. Not Ghana. Demo use at most.
- **Any free hosting outside Ghana for real health data:** conflicts with Act 843 and with our own rule
  that health data stay in Ghana or under GHS control.

## Funding and recognition that cost nothing to apply for

| Opportunity | Relevance | Check |
|---|---|---|
| Digital Public Goods Alliance registry | Recognition for open-source tools; helps GHS and funders adopt them | Confirm the application route and any fee on digitalpublicgoods.net |
| UNICEF StartUp Lab and Innovation Fund | Ghana's 2026 cohort; the Innovation Fund is equity-free for for-profit start-ups up to US$100k | Next call, and whether a not-for-profit or a company qualifies |
| Grand Challenges Canada | Seed funding for maternal and newborn health; needs a registered organisation | Open call dates |
| Hackathon round, November | The current opportunity | Confirm the round's rules and deadline |
