import test from "node:test";
import assert from "node:assert/strict";
import {clampPage, pageCount, pageForIndex, pageItems, tablePageSize} from "../lib/pagination.ts";

test("table pagination divides 50-item pages and clamps stale pages", () => {
  const items = Array.from({length: 123}, (_, index) => index + 1);
  assert.equal(tablePageSize, 50);
  assert.equal(pageCount(items.length), 3);
  assert.equal(clampPage(9, items.length), 2);
  assert.deepEqual(pageItems(items, 0), items.slice(0, 50));
  assert.deepEqual(pageItems(items, 1), items.slice(50, 100));
  assert.deepEqual(pageItems(items, 2), items.slice(100));
});

test("selected rows resolve to their containing page and empty lists retain page zero", () => {
  assert.equal(pageForIndex(-1), 0);
  assert.equal(pageForIndex(0), 0);
  assert.equal(pageForIndex(49), 0);
  assert.equal(pageForIndex(50), 1);
  assert.equal(clampPage(4, 0), 0);
  assert.deepEqual(pageItems([], 4), []);
});
