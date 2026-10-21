import test from "node:test";
import assert from "node:assert/strict";
import {matchFoodAreas} from "../lib/food-menu-matching.ts";
import type {SourceFoodMenu} from "../lib/food-menu-source.ts";
import type {RestArea} from "../lib/rest-areas.ts";
import {reviewDuplicateFoodAreaTargets} from "../lib/food-menu-sync.ts";

const item = (overrides: Partial<SourceFoodMenu> = {}): SourceFoodMenu => ({
  key: "001|1", stdRestCd: "001", restCd: "S001", seq: "1", restName: "\uC11C\uC6B8\uB9CC\uB0A8(\uBD80\uC0B0\uBC29\uD5A5)\uD734\uAC8C\uC18C",
  routeCode: "0010", routeName: "\uACBD\uBD80\uC120", address: null,
  name: "\uC6B0\uB3D9", price: 7000, recommended: false, best: false,
  displayed: true, sourceCreatedAt: null, sourceUpdatedAt: null, ...overrides,
});

const area = (overrides: Partial<RestArea> = {}): RestArea => ({
  id: 1, name: "\uC11C\uC6B8\uB9CC\uB0A8(\uBD80\uC0B0 \uBC29\uD5A5)\uD734\uAC8C\uC18C",
  latitude: 37, longitude: 127, phone: null, routeName: "\uACBD\uBD80\uC120", routeNumber: "1",
  routeDirection: "\uD558\uD589", directionLabel: "\uBD80\uC0B0 \uBC29\uD5A5", restAreaType: null,
  parkingCount: null, facilities: {} as RestArea["facilities"], ...overrides,
});

test("food menu matching requires exact route, normalized name, and direction", () => {
  const matches = matchFoodAreas([
    item(),
    item({key: "002|1", stdRestCd: "002", restName: "\uC11C\uC6B8\uB9CC\uB0A8(\uC11C\uC6B8\uBC29\uD5A5)\uD734\uAC8C\uC18C"}),
    item({key: "003|1", stdRestCd: "003", routeName: "\uC601\uB3D9\uC120"}),
  ], [area(), area({id: 2, directionLabel: "\uC11C\uC6B8 \uBC29\uD5A5"})]);
  assert.deepEqual(matches.map(match => match.status), ["matched", "matched", "unmatched"]);
  assert.deepEqual(matches.map(match => match.restAreaId), [1, 2, null]);
  assert.deepEqual(matches[2].candidates, [1, 2]);
});

test("same source code with inconsistent identifying details is ambiguous", () => {
  const result = matchFoodAreas([
    item(), item({key: "001|2", seq: "2", routeName: "\uD638\uB0A8\uC120"}),
  ], [area()]);
  assert.equal(result[0].status, "ambiguous");
  assert.equal(result[0].restAreaId, null);
});

test("different source codes targeting one DB rest area are withheld as ambiguous", () => {
  const matches = matchFoodAreas([
    item(), item({key: "004|1", stdRestCd: "004"}),
  ], [area()]);
  const reviewed = reviewDuplicateFoodAreaTargets(matches);
  assert.deepEqual(reviewed.map(match => match.status), ["ambiguous", "ambiguous"]);
  assert.deepEqual(reviewed.map(match => match.restAreaId), [null, null]);
});
