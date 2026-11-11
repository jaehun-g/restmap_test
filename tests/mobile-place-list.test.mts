import test from "node:test";
import assert from "node:assert/strict";
import {mobilePlaceList, previewForRestArea} from "../lib/mobile-place-list.ts";
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
test("주유소 보기는 연결 여부와 관계없이 주유소 위치를 각각 표시한다", () => {
  assert.deepEqual(keys("ex"), ["station:EX:linked-a", "station:EX:linked-b", "station:EX:standalone", "station:EX:hidden-area"]);
});

test("연결된 휴게소를 다시 선택하면 주유소 미리보기를 유지하고 다른 휴게소는 정리한다", () => {
  const preview = {restAreaId: 1, station: "linked-a"};
  assert.equal(previewForRestArea(preview, 1), preview);
  assert.equal(previewForRestArea(preview, 2), null);
  assert.equal(previewForRestArea(null, 1), null);
});
