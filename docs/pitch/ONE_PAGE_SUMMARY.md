# Community health records and referrals for Northern Ghana: one-page summary

**Status: prototype for a district pilot. Nothing here is clinically approved, signed by a district, or
live with real patients.** Every module shows its real status on the status board.

## The problem

- Maternal mortality in Ghana is 234 per 100,000 live births in 2023 (modelled estimate, World Bank / UN MMEIG).
- Only 11.5% of children aged 6 to 23 months in Savannah get a minimum acceptable diet, the lowest in Ghana
  (Tekeba et al., 2024, GDHS 2022).
- In Northern Region, 52% of newborns had a postnatal check (GDHS 2022, as cited in the project blueprint).
- Digital CHPS systems have failed before by adding work: in Savannah, e-Tracker use fell from 58.1% of
  facilities to 22.8% within six months, because staff kept paper and tablet side by side (Abotsi et al., 2025).

## What we are building

One offline-first core (the Community Health Toolkit, open source) with separate modules that work alone or together:

| Module | What it does | Status |
|---|---|---|
| 1 Risk before crisis | Ranks a nurse's visits each morning with the reason shown | Built and tested; awaiting clinical sign-off |
| 2 Last-mile follow-up | Tracks each referral until the facility confirms arrival by code; escalates when overdue | Built and tested; SMS confirmation not live |
| 3 Local-food nutrition | Least-cost feeding plans from market prices | Drafts only; nutritionist decision needed |
| 4 Voice-first support | Menu-based approved replies, offline, English and Twi | Built; Twi wording needs a native speaker; speech recognition off |
| 5 Reporting export | The monthly aggregate file a district imports into DHIS2 / DHIMS-2 | Built and tested; imports into DHIS2 demo; needs GHS data-element IDs |
| 6 Hidden barriers | Screens transport, money and who decides; birth plan with the household | Built and tested; screen wording needs local testing |
| 7 Sick child and prevention | Guided sick-child steps and malaria-prevention tracking | Partly built; dose tables need clinical sign-off |

**Shared household record:** one platform ID per person, linked to the CHT contact and the MAMA-AI patient
by reference. It stores no names or phone numbers, queues duplicates for a supervisor, and never merges
automatically. Tested. Connected to a local MAMA-AI instance; the CHT link waits for a CHT demo login.

**MAMA-AI** (deployed): facility referral recommendations from 425 Ghanaian facilities; economics without
invented figures (fixed in May's merge to main).

## What runs today

- Referral recommendation for a patient, from a real facility list (local demo, and the public demo).
- Household record linked to a patient, with a risk flag and a referral request (demo script).
- Monthly export that DHIS2 accepts on a dry run (public DHIS2 demo, sample data).
- Status board showing every module as not approved.

## What we need

1. **A not-for-profit** to hold the agreements and registrations. Filing is in progress.
2. **A clinical advisor** (midwife or public-health physician) to review each module.
3. **A district agreement** with the Regional or District Health Directorate, naming the paper registers it replaces.
4. **Ghana-hosted infrastructure**: quotes requested from NITA and two Accra data centres.
5. **Data-element IDs** for the district's DHIS2 / DHIMS-2 instance from the Ghana Health Service.
6. **Funding for the pilot**, for hosting, SMS and training. Routes: UNICEF's StartUp Lab and Innovation Fund,
   Grand Challenges Canada (needs a registered organisation), and the November hackathon round.

## Risks we are managing openly

- Clinical content is unapproved and labelled so everywhere.
- Speech recognition in Akan measured 42.7% word error rate; it stays off.
- Free demo services are not used for real data; real data stays in Ghana.
- Two earlier problems (invented impact figures; unverified statistics) were found and fixed in public.

## Team

[Names and roles to be added by the project lead.]
