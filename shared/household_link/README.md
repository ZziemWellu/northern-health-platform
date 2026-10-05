# Shared household record

Connects the CHT (households, contacts, tasks) with the MAMA-AI services (patients, facility ranking,
referrals). Each person has one platform ID. The CHT contact and the MAMA-AI patient are linked to it
by reference.

## Rules

- **References only.** The link stores platform IDs and external IDs. No names, phone numbers or
  clinical detail are stored here.
- **Idempotent.** Registering the same source and external ID twice returns the same platform ID.
- **Households are fixed.** A person cannot move to a different household through a link.
- **Duplicates are never merged automatically.** A duplicate is queued for a named supervisor, who
  merges it. The merge moves the references and writes an audit line.
- **A risk flag carries a person, a source, an urgency and one short reason.** Phone numbers are refused.
  A flag becomes a referral request for the arrival module (`referral_arrival/arrival.js`) with no re-entry.

## Status

The module is pure and tested (`test/household_link.test.js`). It is **not yet connected** to the live
CHT or MAMA-AI APIs. Connecting it needs:

1. Storage (a database table in Ghana-hosted infrastructure, not yet chosen).
2. A CHT adapter that reads contacts and writes flags through the CHT REST API.
3. A MAMA-AI adapter that maps patient codes (for example `P004`) to platform IDs.
4. A supervisor screen for pending duplicates.

Until then, the shared record is a specification with tests, not a live link.
