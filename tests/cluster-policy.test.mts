import test from "node:test";
import assert from "node:assert/strict";
import {
  CLUSTER_MIN_LEVEL,
  MAX_INDIVIDUAL_VISIBLE,
  clusterMinLevel,
  countInBounds,
  groupBadgeImageUrl,
  groupByCoordinate,
  shouldCluster,
} from "../lib/cluster-policy.ts";

test("zoomed-in sparse views show individual markers, zoomed-out views cluster", () => {
  assert.equal(shouldCluster(CLUSTER_MIN_LEVEL - 1, 10), false);
  assert.equal(shouldCluster(CLUSTER_MIN_LEVEL, 10), true);
  assert.equal(shouldCluster(CLUSTER_MIN_LEVEL + 3, 0), true);
});

test("dense views keep clustering even when zoomed in; the limit itself is still sparse", () => {
  assert.equal(clusterMinLevel(MAX_INDIVIDUAL_VISIBLE), CLUSTER_MIN_LEVEL);
  assert.equal(clusterMinLevel(MAX_INDIVIDUAL_VISIBLE + 1), 1);
  assert.equal(shouldCluster(1, MAX_INDIVIDUAL_VISIBLE + 1), true);
  assert.equal(shouldCluster(1, MAX_INDIVIDUAL_VISIBLE), false);
});

test("policy thresholds can be overridden", () => {
  assert.equal(clusterMinLevel(5, { maxVisible: 4 }), 1);
  assert.equal(clusterMinLevel(5, { minLevel: 7 }), 7);
});

test("identical coordinates group together in input order while distinct ones stay alone", () => {
  const items = [
    { id: "a", latitude: 37.1234561, longitude: 127.5 },
    { id: "b", latitude: 36, longitude: 128 },
    { id: "c", latitude: 37.1234564, longitude: 127.5 },
  ];
  const groups = groupByCoordinate(items);
  assert.deepEqual(
    groups.map((group) => group.map((item) => item.id)),
    [["a", "c"], ["b"]],
  );
});

test("coordinates that differ at the fifth decimal are not grouped", () => {
  const groups = groupByCoordinate([
    { latitude: 37.12345, longitude: 127 },
    { latitude: 37.12346, longitude: 127 },
  ]);
  assert.equal(groups.length, 2);
});

test("counting in bounds is inclusive on every edge", () => {
  const bounds = { south: 35, west: 127, north: 36, east: 128 };
  const items = [
    { latitude: 35, longitude: 127 },
    { latitude: 36, longitude: 128 },
    { latitude: 35.5, longitude: 127.5 },
    { latitude: 36.1, longitude: 127.5 },
    { latitude: 35.5, longitude: 126.9 },
  ];
  assert.equal(countInBounds(items, bounds), 3);
});

test("group badge image encodes the count, caps large counts and marks lounge groups", () => {
  const plain = decodeURIComponent(groupBadgeImageUrl(3, false));
  assert.match(plain, /^data:image\/svg\+xml/);
  assert.match(plain, />3<\/text>/);
  assert.match(plain, /stroke="#ffffff"/);
  assert.match(decodeURIComponent(groupBadgeImageUrl(120, true)), />99\+<\/text>/);
  assert.match(decodeURIComponent(groupBadgeImageUrl(2, true)), /stroke="#ffb962"/);
});
