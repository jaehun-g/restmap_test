import test from "node:test";
import assert from "node:assert/strict";
import { sortPlacesForList, type MapPlace } from "../lib/map-places.ts";

const rest = (key: string, name: string, lounge: boolean) =>
  ({ kind: "rest", key, record: { name, facilities: { has_truck_lounge: lounge } } }) as unknown as MapPlace;
const station = (key: string, name: string) =>
  ({ kind: "station", key, record: { name } }) as unknown as MapPlace;

test("cluster list puts lounge rest areas first, then rest areas, then stations by name", () => {
  const input = [station("s2", "나 주유소"), rest("r2", "다 휴게소", false), station("s1", "가 주유소"), rest("r1", "라 휴게소", true)];
  assert.deepEqual(sortPlacesForList(input).map((place) => place.key), ["r1", "r2", "s1", "s2"]);
});

test("sorting does not mutate the input array", () => {
  const input = [station("s", "가"), rest("r", "나", true)];
  sortPlacesForList(input);
  assert.deepEqual(input.map((place) => place.key), ["s", "r"]);
});
