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
  assert.deepEqual(result.stations.map(({siteCode, linkedRestAreaId}) => [siteCode, linkedRestAreaId]), [["linked", 1]]);
});

test("route-name search includes standalone stations rather than omitting their markers", () => {
  const result = filterFacilityPlaces(areas, stations, {...options(), query: "경부선"});
  assert.equal(result.facilities.length, 2);
  assert.deepEqual(result.stations.map(item => item.siteCode), ["linked", "opposite", "standalone"]);
});

test("direction filter removes an entire opposite-direction facility without splitting its station", () => {
  const result = filterFacilityPlaces(areas, stations, {
    ...options(), filters: {...initialFilters(), routeName: "경부선", direction: "부산"},
  });
  assert.deepEqual(result.facilities.map(({area}) => area.id), [1]);
  assert.deepEqual(result.stations.map(item => item.siteCode), ["linked"]);
});

test("라운지 필터는 LPG 정보가 연결된 휴게소를 표시하고 별도 주유소 마커는 숨긴다", () => {
  const result = filterFacilityPlaces(areas, stations, {
    ...options(), filters: {...initialFilters(), lounge: "present"}, stationServices: ["lpg"],
  });
  assert.deepEqual(result.facilities.map(({area}) => area.id), [1]);
  assert.deepEqual(result.stations, []);
});

test("location scope filters both kinds consistently while route selection bypasses that scope", () => {
  const scoped = {...options(), scope: {kind: "radius" as const, center: {latitude: 36, longitude: 126}, radiusMeters: 100, referenceLevel: 5}};
  assert.deepEqual(filterFacilityPlaces(areas, stations, scoped), {facilities: [], stations: []});
  const result = filterFacilityPlaces(areas, stations, {...scoped, filters: {...initialFilters(), routeName: "경부선"}});
  assert.equal(result.facilities.length, 2);
  assert.equal(result.stations.length, 3);
});

test("검색어가 있으면 반경 밖 휴게소와 주유소를 찾고 검색을 지우면 반경을 복원한다", () => {
  const scoped = {...options(), scope: {kind: "radius" as const, center: {latitude: 36, longitude: 126}, radiusMeters: 100, referenceLevel: 5}};
  const rest = filterFacilityPlaces(areas, stations, {...scoped, query: "연결 부산"});
  assert.deepEqual(rest.facilities.map(({area}) => area.id), [1]);
  const station = filterFacilityPlaces(areas, stations, {...scoped, query: "독립 주유소"});
  assert.deepEqual(station.stations.map(item => item.siteCode), ["standalone"]);
  const bounds = {...scoped, scope: {kind: "bounds" as const, bounds: {south: 35, north: 36, west: 125, east: 126}}};
  assert.deepEqual(filterFacilityPlaces(areas, stations, {...bounds, query: "연결 부산"}).facilities.map(({area}) => area.id), [1]);
  assert.equal(filterFacilityPlaces(areas, stations, {...scoped, query: "연결 부산", filters: {...initialFilters(), direction: "서울"}}).facilities.length, 0);
  assert.deepEqual(filterFacilityPlaces(areas, stations, {...scoped, query: "   "}), {facilities: [], stations: []});
});

test("no-result searches clear the layer and clearing the query restores every eligible facility", () => {
  assert.deepEqual(filterFacilityPlaces(areas, stations, {...options(), query: "없는 장소"}), {facilities: [], stations: []});
  const result = filterFacilityPlaces(areas, stations, options());
  assert.equal(result.facilities.length, 2);
  assert.equal(result.stations.length, 3);
});

test("이름의 방향으로 연결한 주유소는 해당 휴게소 방향 필터에서도 유지한다", () => {
  const fallback = stations.map(station => station.siteCode === "linked" ? {...station, direction: "통영"} : station);
  const result = filterFacilityPlaces(areas, fallback, {
    ...options(), filters: {...initialFilters(), routeName: "경부선", direction: "부산"},
  });
  assert.deepEqual(result.facilities.map(({area}) => area.id), [1]);
  assert.deepEqual(result.stations.map(station => station.siteCode), ["linked"]);
  assert.equal(result.stations[0].direction, "통영", "원천 방향 필드는 덮어쓰지 않는다");
  const otherDirection = filterFacilityPlaces(areas, fallback, {
    ...options(), filters: {...initialFilters(), routeName: "경부선", direction: "통영"},
  });
  assert.equal(otherDirection.facilities.length, 0);
  assert.equal(otherDirection.stations.length, 0, "원천 방향으로 다른 방향에 재등장하지 않는다");
});

test("서하남 판교 방향 필터에서 쉼터와 연결 주유소를 함께 유지한다", () => {
  const rest = {...areas[0], id: 223, name: "서하남행복드림쉼터", routeName: "수도권제1순환선", directionLabel: "판교 방향", routeDirection: "판교", latitude: 37.5258, longitude: 127.193};
  const fuel = {...stations[0], id: 1400, siteCode: "1000|B00161|판교|S", name: "서하남(판교)주유소", routeName: "수도권제1순환선", direction: "판교", latitude: 37.525914, longitude: 127.1930451};
  const filtered = filterFacilityPlaces([rest], [fuel], {...options(), filters: {...initialFilters(), routeName: "수도권제1순환선", direction: "판교"}});
  assert.deepEqual(filtered.facilities.map(({area}) => area.id), [223]);
  assert.deepEqual(filtered.stations.map(station => station.linkedRestAreaId), [223]);
  const opposite = filterFacilityPlaces([rest], [fuel], {...options(), filters: {...initialFilters(), routeName: "수도권제1순환선", direction: "일산"}});
  assert.equal(opposite.facilities.length, 0);
  assert.equal(opposite.stations.length, 0);
});

test("mobile viewport limits only unfiltered browsing", async () => {
  const {mobileSearchScope} = await import("../lib/facility-filters.ts");
  const {initialFilters} = await import("../lib/rest-area-filters.ts");
  const bounds = {south: 35, west: 126, north: 37, east: 129};
  const filters = initialFilters();
  assert.deepEqual(mobileSearchScope(filters, "", "all", bounds), {kind: "bounds", bounds});
  assert.deepEqual(mobileSearchScope(filters, "", "all", null), {kind: "all"});
  assert.deepEqual(mobileSearchScope(filters, "food", "all", bounds), {kind: "all"});
  assert.deepEqual(mobileSearchScope({...filters, lounge: "present"}, "", "all", bounds), {kind: "all"});
  assert.deepEqual(mobileSearchScope({...filters, facilities: ["has_toilet"]} as unknown as typeof filters, "", "all", bounds), {kind: "all"});
  assert.deepEqual(mobileSearchScope(filters, "", "ex", bounds), {kind: "all"});
});

test("viewport movement updates results and filters bypass the viewport", async () => {
  const {mobileSearchScope} = await import("../lib/facility-filters.ts");
  const filters = initialFilters();
  const first = {south: 36.9999, west: 126.9999, north: 37.0005, east: 127.0005};
  const second = {south: 37.0009, west: 127.0009, north: 37.003, east: 127.003};
  const results = (bounds: typeof first, active = filters) => filterFacilityPlaces(areas, stations, {...options(), filters: active, scope: mobileSearchScope(active, "", "all", bounds)});
  assert.deepEqual(results(first).facilities.map(({area}) => area.id), [1]);
  assert.deepEqual(results(second).facilities.map(({area}) => area.id), [2]);
  assert.deepEqual(results(first, {...filters, lounge: "present"}).facilities.map(({area}) => area.id), [1]);
  assert.deepEqual(results(first, {...filters, routeName: "경부선"}).facilities.map(({area}) => area.id), [1, 2]);
  assert.deepEqual(results(first).facilities.map(({area}) => area.id), [1]);
});
