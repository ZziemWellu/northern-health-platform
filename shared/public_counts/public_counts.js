// Small-number rule for PUBLIC outputs only: anything published outside the health service (a public
// dashboard, a report, a slide, a funder update, a paper). Counts from 1 to SUPPRESS_BELOW - 1 are
// shown as "<5", so a woman in a small village cannot be identified from a number.
//
// It does NOT apply to the district's own reporting. The Module 5 file and the DHIS2 / DHIMS-2 push
// carry exact counts, including 0 to 4: the district needs them to run services and to see rare
// events (a maternal death, an emergency referral), and DHIMS-2 is access-controlled inside GHS.
// Decision recorded on 7 November 2026; the district's HMIS officer is to confirm it in writing
// (ECHIS_ACCESS_GUIDE.md, question 7).
//
// Hiding one cell is not enough when a total is also shown: the hidden value can be worked out by
// subtraction. `suppressGroup` therefore hides a second, smallest visible cell whenever exactly one
// cell in a group with a published total is hidden.
const SUPPRESS_BELOW = 5;
const HIDDEN = `<${SUPPRESS_BELOW}`;

function isCount(value) {
  return Number.isInteger(value) && value >= 0;
}

// One value. Zero is shown: "none" identifies nobody.
function forPublic(value) {
  if (!isCount(value)) throw new Error(`not a whole, non-negative count: ${value}`);
  return value > 0 && value < SUPPRESS_BELOW ? HIDDEN : value;
}

// A group of cells, e.g. { facilityA: 12, facilityB: 3, facilityC: 40 }.
// With `withTotal`, the published total is exact and complementary suppression is applied.
function suppressGroup(cells, { withTotal = false } = {}) {
  const out = {};
  const hidden = [];
  for (const [key, value] of Object.entries(cells)) {
    out[key] = forPublic(value);
    if (out[key] === HIDDEN) hidden.push(key);
  }
  if (withTotal && hidden.length === 1) {
    const candidates = Object.entries(cells)
      .filter(([key, value]) => out[key] !== HIDDEN && value > 0)
      .sort((a, b) => a[1] - b[1]);
    if (candidates.length) out[candidates[0][0]] = HIDDEN;
  }
  if (withTotal) {
    const total = Object.values(cells).reduce((sum, v) => sum + v, 0);
    return { cells: out, total: forPublic(total) };
  }
  return { cells: out };
}

module.exports = { SUPPRESS_BELOW, HIDDEN, forPublic, suppressGroup };
