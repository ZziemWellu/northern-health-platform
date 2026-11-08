# Demo identifiers for the Module 5 file

**Not real DHIS2 identifiers.** These stand in for the Ghana Health Service's DHIMS-2 organisation
units and data elements, so the demo can produce the monthly file. `npm run demo-seed` uses them.

- `org_units.json`: the demo CHPS zones (Dalun, Gbullung, Bontanga) to demo organisation unit IDs.
- `mapping.json`: each Module 5 measure to a demo data element ID.

For a real district, both come from the district's DHIMS-2 metadata (see `ECHIS_ACCESS_GUIDE.md`),
and the measures must be matched to GHS definitions before any number is reported.
