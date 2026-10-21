import test from "node:test";
import assert from "node:assert/strict";
import {linkedStationsByArea, mergeFacilityPlaces, REST_AREA_STATION_MATCH_METERS} from "../lib/facility-places.ts";
import type {GasStationRecord} from "../lib/gas-stations.ts";
import type {RestArea} from "../lib/rest-areas.ts";

const area = (overrides: Partial<RestArea> = {}): RestArea => ({
  id: 1,
  name: "죽전(서울 방향)",
  latitude: 37.33,
  longitude: 127.1,
  phone: null,
  routeName: "경부선",
  routeNumber: null,
  routeDirection: "서울 방향",
  directionLabel: "서울 방향",
  restAreaType: null,
  parkingCount: null,
  facilities: {} as RestArea["facilities"],
  ...overrides,
});
const station = (overrides: Partial<GasStationRecord> = {}): GasStationRecord => ({
  id: 10,
  siteCode: "ex-10",
  brand: "EX",
  name: "죽전(서울)주유소",
  latitude: 37.3305,
  longitude: 127.1,
  phone: null,
  address: null,
  detailAddress: null,
  openTime: null,
  closeTime: null,
  services: {cargo: null, convenience: null, self: null, lpg: null, carWash: null, ev: null},
  routeName: "경부선",
  direction: "서울",
  revision: "",
  ...overrides,
});

test("same route, service area, direction, and a 300m coordinate match become one facility", () => {
  const result = mergeFacilityPlaces([area()], [station()]);
  assert.deepEqual(result.facilities, [{area: area()}]);
  assert.deepEqual(result.stations.map(({siteCode, linkedRestAreaId}) => [siteCode, linkedRestAreaId]), [["ex-10", 1]]);
  assert.deepEqual(linkedStationsByArea(result.facilities, result.stations).get(1), result.stations);
});

test("opposite direction, a route mismatch, or a far coordinate never auto-merges", () => {
  const stations = [
    station({siteCode: "opposite", direction: "부산"}),
    station({siteCode: "route", routeName: "중부선"}),
    station({siteCode: "far", latitude: 37.34}),
  ];
  const result = mergeFacilityPlaces([area()], stations);
  assert.equal(result.stations.filter(item => item.linkedRestAreaId === 1).length, 0);
  assert.deepEqual(result.stations.map(item => item.siteCode), ["far", "opposite", "route"]);
  assert.equal(REST_AREA_STATION_MATCH_METERS, 300);
});

test("one EX station is assigned to only the nearest duplicate rest-area record", () => {
  const result = mergeFacilityPlaces(
    [area({id: 1, latitude: 37.33}), area({id: 2, latitude: 37.3308})],
    [station({latitude: 37.3307})],
  );
  assert.deepEqual(result.stations.map(station => station.linkedRestAreaId), [2]);
});
