import test from "node:test";
import assert from "node:assert/strict";
import {filterFacilityPlaces} from "../lib/facility-filters.ts";
import {initialFilters} from "../lib/rest-area-filters.ts";
import {normalizeRestAreas} from "../lib/rest-areas.ts";
import {normalizeExGasStations} from "../lib/ex-gas-stations.ts";

const a = normalizeRestAreas([
  {id: 1, name: "연결(부산)", route_name: "경부선", direction_label: "부산 방향", latitude: 37, longitude: 127, has_truck_lounge: true},
  {id: 2, name: "연결(서울)", route_name: "경부선", direction_label: "서울 방향", latitude: 37.001, longitude: 127.001, has_truck_lounge: false},
]);
const s = normalizeExGasStations([
  {id: 1, source_key: "linked", service_area_name: "연결(부산)주유소", route_name: "경부선", direction: "부산", latitude: 37.0001, longitude: 127, lpg_available: true},
  {id: 2, source_key: "opposite", service_area_name: "연결(서울)주유소", route_name: "경부선", direction: "서울", latitude: 37.0011, longitude: 127.001},
  {id: 3, source_key: "standalone", service_area_name: "독립 주유소", route_name: "경부선", direction: "서울", latitude: 37.002, longitude: 127.002},
]);
if (!a.ok || !s.ok) throw new Error("Invalid fixture");
const areas = a.value;
const stations = s.value;
const options = () => ({filters: initialFilters(), query: "", stationServices: [], scope: {kind: "all" as const}, position: null});

test("station-name and mixed rest/station search retain the original facility identity and anchor", () => {
  const result = filterFacilityPlaces(areas, stations, {...options(), query: "연결 부산 주유소"});
  assert.deepEqual(result.facilities.map(({area}) => [area.id, area.latitude, area.longitude]), [[1, 37, 127]]);
  assert.equal(result.facilities[0].stations[0].siteCode, "linked");
  assert.deepEqual(result.unmatchedStations, []);
});

test("route-name search includes standalone stations rather than omitting their markers", () => {
  const result = filterFacilityPlaces(areas, stations, {...options(), query: "경부선"});
  assert.equal(result.facilities.length, 2);
  assert.deepEqual(result.unmatchedStations.map(item => item.siteCode), ["standalone"]);
});

test("direction filter removes an entire opposite-direction facility without splitting its station", () => {
  const result = filterFacilityPlaces(areas, stations, {
    ...options(), filters: {...initialFilters(), routeName: "경부선", direction: "부산"},
  });
  assert.deepEqual(result.facilities.map(({area}) => area.id), [1]);
  assert.deepEqual(result.unmatchedStations, []);
});

test("rest facility and station service filters operate on the same integrated place", () => {
  const result = filterFacilityPlaces(areas, stations, {
    ...options(), filters: {...initialFilters(), lounge: "present"}, stationServices: ["lpg"],
  });
  assert.deepEqual(result.facilities.map(({area}) => area.id), [1]);
  assert.equal(result.facilities[0].stations.length, 1);
  assert.deepEqual(result.unmatchedStations, []);
});

test("location scope filters both kinds consistently while route selection bypasses that scope", () => {
  const scoped = {...options(), scope: {kind: "radius" as const, center: {latitude: 36, longitude: 126}, radiusMeters: 100, referenceLevel: 5}};
  assert.deepEqual(filterFacilityPlaces(areas, stations, scoped), {facilities: [], unmatchedStations: []});
  const result = filterFacilityPlaces(areas, stations, {...scoped, filters: {...initialFilters(), routeName: "경부선"}});
  assert.equal(result.facilities.length, 2);
  assert.equal(result.unmatchedStations.length, 1);
});

test("no-result searches clear the layer and clearing the query restores every eligible facility", () => {
  assert.deepEqual(filterFacilityPlaces(areas, stations, {...options(), query: "없는 장소"}), {facilities: [], unmatchedStations: []});
  const result = filterFacilityPlaces(areas, stations, options());
  assert.equal(result.facilities.length, 2);
  assert.equal(result.unmatchedStations.length, 1);
});
