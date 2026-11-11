import test from "node:test";
import assert from "node:assert/strict";
import {mobilePlaceList} from "../lib/mobile-place-list.ts";
import type {RestArea} from "../lib/rest-areas.ts";
import type {FacilityStation} from "../lib/facility-places.ts";

const areas = [{id: 1, name: "연결 휴게소"}, {id: 2, name: "독립 휴게소"}] as RestArea[];
const stations = [
  {siteCode: "linked-a", brand: "EX", linkedRestAreaId: 1},
  {siteCode: "linked-b", brand: "EX", linkedRestAreaId: 1},
  {siteCode: "standalone", brand: "EX", linkedRestAreaId: null},
  {siteCode: "hidden-area", brand: "EX", linkedRestAreaId: 3},
] as FacilityStation[];
const keys = (view: "all" | "rest" | "ex") => mobilePlaceList(areas, stations, view).map(place => place.key);

test("통합 보기는 연결된 여러 주유소를 휴게소 하나로 묶고 나머지는 유지한다", () => {
  assert.deepEqual(keys("all"), ["rest:1", "rest:2", "station:EX:standalone", "station:EX:hidden-area"]);
});
test("휴게소 보기는 휴게소만 표시한다", () => {
  assert.deepEqual(keys("rest"), ["rest:1", "rest:2"]);
});
test("주유소 보기는 주유소가 연결된 휴게소와 독립 주유소를 표시한다", () => {
  assert.deepEqual(keys("ex"), ["rest:1", "station:EX:standalone", "station:EX:hidden-area"]);
});
