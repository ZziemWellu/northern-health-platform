const { test } = require('node:test');
const assert = require('node:assert/strict');
const { SUPPRESS_BELOW, HIDDEN, forPublic, suppressGroup } = require('../public_counts');

test('counts from 1 to 4 are hidden in public; 0 and 5 or more are shown', () => {
  assert.equal(forPublic(0), 0);
  for (let n = 1; n < SUPPRESS_BELOW; n++) assert.equal(forPublic(n), HIDDEN);
  assert.equal(forPublic(SUPPRESS_BELOW), SUPPRESS_BELOW);
  assert.equal(forPublic(42), 42);
});

test('anything that is not a count is refused, not published', () => {
  for (const bad of [-1, 2.5, '7', null, undefined, NaN]) assert.throws(() => forPublic(bad));
});

test('one hidden cell next to an exact total gets a second hidden cell, so it cannot be subtracted out', () => {
  const { cells, total } = suppressGroup({ a: 12, b: 3, c: 40 }, { withTotal: true });
  assert.equal(total, 55);
  assert.equal(cells.b, HIDDEN);
  assert.equal(cells.a, HIDDEN, 'the smallest other cell is hidden too');
  assert.equal(cells.c, 40);
});

test('without a published total, only the small cells are hidden', () => {
  assert.deepEqual(suppressGroup({ a: 12, b: 3 }).cells, { a: 12, b: HIDDEN });
});

test('a small total is itself hidden', () => {
  assert.equal(suppressGroup({ a: 1, b: 2 }, { withTotal: true }).total, HIDDEN);
});
