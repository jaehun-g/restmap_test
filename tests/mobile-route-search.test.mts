import test from "node:test";
import assert from "node:assert/strict";
import { filterMobileRestAreas, initialFilters } from "../lib/rest-area-filters.ts";
import { normalizeRestAreas } from "../lib/rest-areas.ts";
import { MobileLocationController } from "../lib/mobile-location.ts";
import type { GeoSearchScope } from "../lib/geo-search.ts";

const origin = { latitude: 37, longitude: 127 };
const radius: GeoSearchScope = { kind: "radius", center: origin, radiusMeters: 15000, referenceLevel: 9 };
const bounds: GeoSearchScope = { kind: "bounds", bounds: { south: 36.99, west: 126.99, north: 37.02, east: 127.02 } };
function areas() {
  const normalized = normalizeRestAreas([
    { id: 1, name: "가까운 휴게소", route_name: "경부선", latitude: 37.01, longitude: 127, has_store: 1, has_truck_lounge: 1 },
    { id: 2, name: "먼 휴게소", route_name: "경부선", latitude: 35, longitude: 128, has_store: 1, has_truck_lounge: 1 },
    { id: 3, name: "좌표 없는 휴게소", route_name: "경부선", has_store: 0, has_truck_lounge: 0 },
    { id: 4, name: "다른 노선 휴게소", route_name: "영동선", latitude: 37.01, longitude: 127 },
  ]);
  assert.ok(normalized.ok);
  return normalized.value;
}

test("selected routes include distant and unpositioned rest areas regardless of radius or map bounds", () => {
  const records = areas();
  const filters = { ...initialFilters(), routeName: "경부선" };
  for (const scope of [radius, bounds]) {
    assert.deepEqual(filterMobileRestAreas(records, filters, "", scope, origin).map((area) => area.id), [1, 2, 3]);
    assert.deepEqual(filterMobileRestAreas(records, filters, "", scope, null).map((area) => area.id), [1, 2, 3]);
  }
  assert.deepEqual(records.map((area) => area.id), [1, 2, 3, 4]);
});

test("route-wide results retain search, facilities and lounge conditions and distance order", () => {
  const filters = { ...initialFilters(), routeName: "경부선", facilities: ["has_store" as const], lounge: "present" as const };
  assert.deepEqual(filterMobileRestAreas(areas(), filters, "먼 경부선", radius, origin).map((area) => area.id), [2]);
  assert.deepEqual(filterMobileRestAreas(areas(), filters, "", radius, origin).map((area) => area.id), [1, 2]);
  assert.deepEqual(filterMobileRestAreas(areas(), filters, "없는 검색어", radius, origin), []);
  const farPosition = { latitude: 35, longitude: 128 };
  assert.deepEqual(filterMobileRestAreas(areas(), filters, "", radius, farPosition).map((area) => area.id), [2, 1]);
});

test("clearing or resetting the selected route restores the saved geographic scope", () => {
  const records = areas();
  for (const scope of [radius, bounds]) {
    const saved = structuredClone(scope);
    const filters = { ...initialFilters(), routeName: "경부선" };
    assert.equal(filterMobileRestAreas(records, filters, "", scope, origin).length, 3);
    assert.deepEqual(filterMobileRestAreas(records, { ...filters, routeName: null }, "", scope, origin).map((area) => area.id), [1, 4]);
    assert.deepEqual(filterMobileRestAreas(records, initialFilters(), "", scope, origin).map((area) => area.id), [1, 4]);
    assert.deepEqual(scope, saved);
  }
});

test("late GPS responses and newer map searches cannot narrow selected-route results", async () => {
  const controller = new MobileLocationController();
  let resolve!: (result: { ok: true; value: typeof origin }) => void;
  const pending = controller.requestLocation(() => new Promise((done) => { resolve = done; }));
  const filters = { ...initialFilters(), routeName: "경부선" };
  const results = () => {
    const state = controller.getSnapshot();
    return filterMobileRestAreas(areas(), filters, "", state.scope, state.position).map((area) => area.id);
  };
  assert.deepEqual(results(), [1, 2, 3]);
  resolve({ ok: true, value: origin });
  await pending;
  assert.deepEqual(results(), [1, 2, 3]);
  controller.radiusReady(9);
  controller.zoomChanged(8);
  assert.deepEqual(results(), [1, 2, 3]);
  controller.research({ south: 0, west: 0, north: 1, east: 1 });
  assert.deepEqual(results(), [1, 2, 3]);
});
