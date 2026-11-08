# Community health app for CHPS nurses in Northern Ghana: one-page summary

**Status: ready for a district pilot; not yet clinically approved or used with real patients.**
Everything shown in demos uses made-up people.

## The problem

- Maternal mortality in Ghana: 234 per 100,000 live births in 2023 (modelled estimate, World Bank / UN MMEIG).
- In Northern Region, 52% of newborns had a postnatal check (GDHS 2022, as cited in the project blueprint).
- Danger signs found at a home visit sit on paper until someone acts on them; monthly reports are
  tallied by hand from the same registers.
- Digital CHPS tools have failed before by adding work: in Savannah, e-Tracker use fell from 58.1% of
  facilities to 22.8% within six months, because staff kept paper and tablet side by side (Abotsi et al., 2025).

## What the pilot does

Built on the **Community Health Toolkit** (open source, offline-first, used by health ministries in
other countries), so the district is not dependent on one developer or one company.

| Part | What the nurse gets |
|---|---|
| **Module 1: risk before crisis** | Each morning, her visits ranked by urgency with the reason shown. A danger-sign check that applies the rules (for example, blood pressure 150/100 with a severe headache = possible pre-eclampsia, refer now) and explains the result in plain words. Newborn visits on the national schedule. |
| **Raising a referral** | A danger sign becomes a referral task at the top of her list; an emergency can only go to a hospital; the family gets a referral code. |
| **Module 5: the monthly report** | The month's counts per CHPS zone, built from her visits, in DHIMS-2's import format. Exact numbers to the district; the paper tally can stop. |
| **Local languages** | Each client's language is recorded (31 languages of the five northern regions; Dagbani first for Kumbungu). Client messages are sent only in translations checked by a second speaker and approved. |

Screenshots: `docs/pitch/screens/`. A two-minute walkthrough video and a live demo are available.

## What has been done

- The pilot app runs on a real CHT server and on an Android phone emulator; every step of the demo is
  checked automatically (`cht-app/demo/walkthrough.js`).
- Several hundred automated tests, run on every change: task ranking, danger-sign rules, referral routing, the Module 5 file,
  languages.
- Public code, with an open security and code review (`docs/SECURITY_REVIEW.md`, `docs/CODE_REVIEW_2026-11-07.md`).

## What it needs next (Phase 0, `docs/PILOT_PLAN.md`)

1. **A clinical advisor** (midwife or public-health physician, Northern Region) to review the rules.
2. **An institutional home** to hold agreements, registrations and funds (`docs/outreach/institutional_home.md`).
3. **The Kumbungu District Health Directorate's agreement**, naming the paper registers the pilot retires.
4. **Ethics approval** and **Data Protection Commission** registration.
5. **A Ghana-hosted server** (quotes requested from NITA and Accra data centres).
6. **DHIMS-2 identifiers** for the district's data elements and CHPS zones.
7. **A Dagbani translator and a separate checker** from Kumbungu.

## The pilot

Five Kumbungu nurses, their own phones, six weeks. Measured: time per task against paper; danger signs
found and how quickly they were referred; newborn visits on time; whether the monthly file matches a
hand count; usability (System Usability Scale); every error and hazard. Plan:
`docs/outreach/pilot_evidence_plan.md`.

## Cost

Per nurse per year, built up from hosting, data bundles, phones, training and support:
`docs/pitch/COSTING.md`. Hosting quotes are pending, so no total is quoted yet.

## What we ask for

[To be filled in for each audience: the pilot budget, an institutional partner, a clinical advisor,
or an introduction to the district.]

## What we do not claim

No health outcomes, lives saved or cost savings: none have been measured. No approval or endorsement
by the Ghana Health Service or any district. No live SMS or speech recognition.

## Contact

[Name, role, email, phone.]
