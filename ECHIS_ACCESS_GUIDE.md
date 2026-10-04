# Getting access to Ghana's eCHIS (for the DHIS2 export)

Written for: the project lead, to take to the Regional Health Directorate.

## What we found

- The electronic Community Health Information System (eCHIS) is run by Ghana Health Service (GHS). Community data flows into the national health information system, which is DHIS2-based.
- We found no public, self-service API for eCHIS. Access is arranged through people, not a sign-up page.
- The route that works is through the **Regional HMIS / M&E officer** and, for system-level integration, **GHS Digital Health**.
- Verify the current contacts and the mediator setup with GHS before relying on any name or system detail here.

## What to ask for (in writing)

1. A **DHIS2 user account** for the Northern Region pilot, with the role that allows data entry (aggregate data values only, no individual records).
2. The **org unit UID** for the pilot facility or sub-district (Kumbungu, once chosen).
3. The **data element UIDs** and **category option combos** for each measure we report (pregnancies registered, referrals completed, barriers found). Ask for the GHS indicator definitions alongside them.
4. The **reporting period convention** the national system uses (monthly or quarterly) and the data set they belong to.
5. Confirmation of whether eCHIS → DHIS2 is already connected (a mediator), so we do not double-count with the CHW's own entries.
6. Written approval for the pilot, with a named officer who owns the account.

## What we will not ask for or send

- No individual records, names, phone numbers or patient identifiers. The export sends counts only.
- Counts below 5 are withheld (`SUPPRESS_BELOW` in `integration/dhis2.js`).
- No live push until the mapping has no TODO values and `DHIS2_LIVE=1` is set on purpose.

## How the code connects once you have the UIDs

1. Put the UIDs in `config/dhis2.json` (not in the code).
2. Check the dry run first: `POST /api/dataValueSets?dryRun=true` shows conflicts without writing anything.
3. Only then set `DHIS2_LIVE=1`, `DHIS2_URL`, `DHIS2_USER`, `DHIS2_PASSWORD` and run the export.

## What we already tested (public DHIS2 demo, dummy data only)

- The demo is DHIS2 2.43.1, Sierra Leone sample data. It is **not** Ghana data and resets regularly.
- A live push of one dummy count (value 42, quarter 2026Q2, org unit Gbenikoro MCHP) was accepted with HTTP 200, and read back as `"42"`.
- Early attempts were rejected for two real reasons, which we fixed: the data set is **quarterly**, not monthly, and the org unit must be **assigned to the data set**. Both checks come from the server, not from our code.
- Two measures (referrals, barriers) have no matching element in the demo, so they were withheld, not guessed.

## Who to contact (to be confirmed)

- Northern Regional Health Directorate: HMIS / M&E unit.
- GHS Digital Health (national): for eCHIS–DHIS2 integration questions.
- Tɛkyerɛma Pa / HCI Lab, University of Ghana: Akan speech resources (separate from eCHIS).
