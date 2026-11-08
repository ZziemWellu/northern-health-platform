# Cost per nurse per year: how to build the figure

Written for: the project lead preparing a budget, and a funder who asks "what does it cost per nurse?"

**No total is quoted here yet.** Hosting quotes are pending, and Ghana prices for data bundles,
phones and training must come from real quotes, not estimates. Fill in the "Amount" column as each
quote arrives, and keep the source next to it. A funder will ask where each number came from.

## The formula

```
cost per nurse per year =
    (server + backups + domain and certificate + system administration) / number of nurses
  + data bundle per nurse
  + phone (only if the project buys phones) / years of phone life
  + training per nurse (first year; refresher after)
  + supervision and support per nurse
```

Shared costs fall per nurse as more nurses join, so give the figure for the pilot (5 nurses) and for
a district (all of its CHPS nurses). Ask the District Health Directorate how many there are.

## The items

| Item | Unit | Amount | Source and status |
|---|---|---|---|
| Community Health Toolkit software | | 0 | Open source (AGPL); no licence fee |
| CHT server in Ghana (production) | per month | | Quote requested: NITA, PAIX/RackAfrica, Digital Realty (`docs/outreach/quote_request_*.md`) |
| Backups (off-server, in Ghana) | per month | | Ask in the same quotes |
| Domain (.gh or .com) and certificate | per year | | Registrar's price list; certificate can be free (Let's Encrypt) |
| System administration (updates, backups checked, accounts) | hours per month x rate | | Who does it, and at what rate |
| Demo server (synthetic data only, outside Ghana) | per month | | Covered by student cloud credit for now (GitHub Student Developer Pack) |
| Mobile data per nurse | per month | | **Measure in the field test**: record each phone's data use for six weeks, then price it with a local bundle |
| Phones | per phone | | Pilot uses the nurses' own phones (the test is whether they cope). Price a phone only if the district asks for provided phones |
| Training | per nurse | | Days x (per diem + transport + trainer); ask the DHD for its standard training rates |
| Supervision and support | per nurse per month | | Supervisor time; help line |
| SMS reminders (not in the pilot) | per message x messages per client | | Later: needs an SMS provider quote and checked translations |

## What the field test adds

The pilot measures three of these directly: data used per phone, training time per nurse, and support
requests per nurse per week. Use those, not guesses, in the funding request after the pilot.

## How to present it

- Give the pilot cost (5 nurses, 6 weeks) separately from the yearly cost for a district.
- Show shared costs and per-nurse costs separately; funders compare the per-nurse figure across tools.
- Compare with what the district spends today on paper registers and hand tallies only if the district
  gives you that figure; do not estimate it.
