import test from "node:test";
import assert from "node:assert/strict";
import {
  distanceMeters, filterByGeoScope, radiusForLevel, scopeLabel, formatDistance,
  type GeoPoint, type GeoSearchScope,
} from "../lib/geo-search.ts";
import { normalizeRestAreas } from "../lib/rest-areas.ts";
import { filterRestAreas, initialFilters } from "../lib/rest-area-filters.ts";

const origin = { latitude: 37, longitude: 127 };
function areas() {
  const result = normalizeRestAreas([
    { id: 3, name: "먼 휴게소", route_name: "경부", latitude: 37.2, longitude: 127, has_truck_lounge: 1, has_store: 1 },
    { id: 2, name: "가까운 휴게소", route_name: "경부", latitude: 37.01, longitude: 127, has_truck_lounge: 1, has_store: 1 },
    { id: 1, name: "가까운 휴게소2", route_name: "경부", latitude: 37.01, longitude: 127, has_truck_lounge: 0, has_store: 0 },
    { id: 4, name: "노선 없는 휴게소", latitude: 37, longitude: 127.01, has_truck_lounge: null },
    { id: 5, name: "좌표 없는 휴게소", latitude: null, longitude: null },
  ]);
  assert.ok(result.ok);
  return result.value;
}
const radius: GeoSearchScope = { kind: "radius", center: origin, radiusMeters: 15000, referenceLevel: 9 };

test("15km radius excludes distant and unpositioned rows and includes its boundary", () => {
  const records = areas();
  assert.deepEqual(filterByGeoScope(records, radius, origin).map(area => area.id), [4, 1, 2]);
  const boundary = distanceMeters(origin, { latitude: records[0].latitude!, longitude: records[0].longitude! });
  assert.ok(filterByGeoScope(records, { ...radius, radiusMeters: boundary }, null).some(area => area.id === 3));
  assert.ok(!filterByGeoScope(records, { ...radius, radiusMeters: boundary - 1 }, null).some(area => area.id === 3));
});

test("zooming doubles or halves radius without changing its geographic center", () => {
  assert.equal(radiusForLevel(9, 9), 15000);
  assert.equal(radiusForLevel(10, 9), 30000);
  assert.equal(radiusForLevel(8, 9), 7500);
  assert.equal(radiusForLevel(11, 9), 60000);
  assert.deepEqual(filterByGeoScope(areas(), { ...radius, radiusMeters: radiusForLevel(10, 9) }, origin).map(area => area.id), [4, 1, 2, 3]);
});

test("a committed map rectangle replaces the user radius and includes rectangle edges", () => {
  const scope: GeoSearchScope = { kind: "bounds", bounds: { south: 37.2, north: 37.3, west: 126.9, east: 127 } };
  assert.deepEqual(filterByGeoScope(areas(), scope, origin).map(area => area.id), [3]);
});

test("geographic filtering combines with search, route, facilities and lounge using AND", () => {
  const conditions = { ...initialFilters(), routeName: "경부", facilities: ["has_store" as const], lounge: "present" as const };
  const matching = filterRestAreas(areas(), conditions, "경부 휴게소");
  assert.deepEqual(filterByGeoScope(matching, radius, origin).map(area => area.id), [2]);
  assert.equal(filterByGeoScope(filterRestAreas(areas(), conditions, "없는 검색어"), radius, origin).length, 0);
});

test("distance order uses the actual user position, breaks ties by ID and retains source order without GPS", () => {
  const records = areas();
  const original = records.map(area => area.id);
  assert.deepEqual(filterByGeoScope(records, { kind: "all" }, null).map(area => area.id), original);
  assert.deepEqual(filterByGeoScope(records, { kind: "all" }, origin).map(area => area.id), [4, 1, 2, 3, 5]);
  assert.deepEqual(records.map(area => area.id), original);
  const differentPosition: GeoPoint = { latitude: 37.2, longitude: 127 };
  assert.equal(filterByGeoScope(records, { kind: "all" }, differentPosition)[0].id, 3);
});

test("distance and active search labels show meters, fractional kilometers and modes", () => {
  assert.equal(distanceMeters(origin, origin), 0);
  assert.equal(formatDistance(321.3), "321m");
  assert.equal(formatDistance(1500), "1.5km");
  assert.equal(scopeLabel(radius), "내 위치 기준 반경 15km");
  assert.equal(scopeLabel({ ...radius, radiusMeters: 7500 }), "내 위치 기준 반경 7.5km");
  assert.equal(scopeLabel({ kind: "bounds", bounds: { south: 0, west: 0, north: 1, east: 1 } }), "지도 영역 검색");
});
