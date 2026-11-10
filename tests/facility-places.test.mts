import test from "node:test";
import assert from "node:assert/strict";
import {linkedStationsByArea, mergeFacilityPlaces, REST_AREA_STATION_MATCH_METERS} from "../lib/facility-places.ts";
import type {GasStationRecord} from "../lib/gas-stations.ts";
import type {RestArea} from "../lib/rest-areas.ts";
import {verifiedRestAreaStations} from "../lib/verified-rest-area-stations.ts";
import {normalizeExGasStations} from "../lib/ex-gas-stations.ts";

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

test("김해금관가야 기장 주유소를 양방향 휴게소에 연결한다", () => {
  const rest = area({id: 192, name: "김해금관가야(양방향)", routeName: "부산외곽순환선", directionLabel: "양방향", latitude: 35.2699, longitude: 129.003});
  const fuel = station({siteCode: "6000|B00216|기장|AD", name: "김해금관가야(기장)주유소", routeName: "부산외곽순환선", direction: "기장", latitude: 35.2695894, longitude: 129.0030215});
  assert.equal(mergeFacilityPlaces([rest], [fuel]).stations[0].linkedRestAreaId, 192);
  assert.equal(mergeFacilityPlaces([rest], [{...fuel, latitude: 35.28}]).stations[0].linkedRestAreaId, null);
});

test("선산·문경 창원 주유소는 원천 방향이 양평이어도 창원 휴게소에 연결한다", () => {
  for (const item of [
    {name: "선산", code: "0450|B00102|양평|AD", restLat: 36.2742, restLon: 128.251, fuelLat: 36.2738648, fuelLon: 128.2516744},
    {name: "문경", code: "0450|B00137|양평|AD", restLat: 36.6205, restLon: 128.15, fuelLat: 36.6194935, fuelLon: 128.1509056},
  ]) {
    const result = normalizeExGasStations([{id: 10, source_key: item.code, service_area_name: `${item.name}(창원)주유소`, route_name: "중부내륙선", direction: "양평", latitude: item.fuelLat, longitude: item.fuelLon}]);
    assert.ok(result.ok);
    const areas = [area({id: 1, name: `${item.name}(창원 방향)`, routeName: "중부내륙선", directionLabel: "창원 방향", latitude: item.restLat, longitude: item.restLon}), area({id: 2, name: `${item.name}(양평 방향)`, routeName: "중부내륙선", directionLabel: "양평 방향", latitude: item.restLat, longitude: item.restLon})];
    assert.equal(mergeFacilityPlaces(areas, result.value).stations[0].linkedRestAreaId, 1);
  }
});

test("영덕·포항·김제 주유소는 검증된 노선과 방향으로 해당 휴게소에 연결한다", () => {
  for (const item of [
    {id: 212, name: "영덕", direction: "영덕", route: "포항영덕선", sourceRoute: "동해선", code: "0650|B00246|속초|AD", restLat: 36.2807, restLon: 129.364, lat: 36.2806002, lon: 129.3639097},
    {id: 213, name: "포항", direction: "포항", route: "포항영덕선", sourceRoute: "동해선", code: "0650|B00247|동해|AD", restLat: 36.2633, restLon: 129.372, lat: 36.2616071, lon: 129.3720864},
    {id: 214, name: "김제", direction: "전주", route: "새만금포항선", sourceRoute: null, code: "7001|B00248|포항|AD", restLat: 35.8394, restLon: 126.898, lat: 35.8400648, lon: 126.899561},
    {id: 215, name: "김제", direction: "새만금", route: "새만금포항선", sourceRoute: null, code: "7001|B00249|익산|AD", restLat: 35.8421, restLon: 126.903, lat: 35.8412714, lon: 126.9014655},
  ]) {
    const result = normalizeExGasStations([{id: 10, source_key: item.code, service_area_name: `${item.name}(${item.direction})주유소`, route_name: item.sourceRoute, direction: "다른 방향", latitude: item.lat, longitude: item.lon}]);
    assert.ok(result.ok);
    const rest = area({id: item.id, name: `${item.name}(${item.direction} 방향)`, routeName: item.route, directionLabel: `${item.direction} 방향`, latitude: item.restLat, longitude: item.restLon});
    assert.equal(mergeFacilityPlaces([rest], result.value).stations[0].linkedRestAreaId, item.id);
  }
});

test("의왕청계 일산 주유소는 보정한 위치와 방향으로 의왕청계 휴게소에 연결한다", () => {
  const result = normalizeExGasStations([{id: 1399, source_key: "1000|B00158|판교|HD", service_area_name: "의왕청계(일산)주유소", route_name: "수도권제1순환선", direction: "판교", latitude: 37.3932302, longitude: 127.0221883}]);
  assert.ok(result.ok);
  const rest = area({id: 222, name: "의왕청계(일산 방향)", routeName: "수도권제1순환선", directionLabel: "일산 방향", latitude: 37.3934, longitude: 127.023});
  assert.equal(mergeFacilityPlaces([rest], result.value).stations[0].linkedRestAreaId, 222);
});

test("서하남 주유소는 이름·방향이 다른 쉼터에만 연결하고 노선과 거리 검증을 유지한다", () => {
  const rest = area({id: 223, name: "서하남행복드림쉼터", routeName: "수도권제1순환선", directionLabel: null, routeDirection: null, latitude: 37.5258, longitude: 127.193});
  const fuel = station({siteCode: "1000|B00161|판교|S", name: "서하남(판교)주유소", routeName: "수도권제1순환선", direction: "판교", latitude: 37.525914, longitude: 127.1930451});
  assert.equal(mergeFacilityPlaces([rest], [fuel]).stations[0].linkedRestAreaId, 223);
  assert.equal(mergeFacilityPlaces([{...rest, id: 224}], [fuel]).stations[0].linkedRestAreaId, null);
  assert.equal(mergeFacilityPlaces([{...rest, routeName: "경부선"}], [fuel]).stations[0].linkedRestAreaId, null);
  assert.equal(mergeFacilityPlaces([{...rest, latitude: 37.6}], [fuel]).stations[0].linkedRestAreaId, null);
});

test("same route, service area, direction, and a 300m coordinate match become one facility", () => {
  const result = mergeFacilityPlaces([area()], [station()]);
  assert.deepEqual(result.facilities, [{area: area()}]);
  assert.deepEqual(result.stations.map(({siteCode, linkedRestAreaId}) => [siteCode, linkedRestAreaId]), [["ex-10", 1]]);
  assert.deepEqual(linkedStationsByArea(result.facilities, result.stations).get(1), result.stations);
});

test("opposite direction, a route mismatch, or a far coordinate never auto-merges", () => {
  const stations = [
    station({siteCode: "opposite", name: "죽전(부산)주유소", direction: "부산"}),
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

test("노선 별칭을 같은 후보로 찾고 거리 동률에서는 원본 휴게소 순서를 유지한다", () => {
  const result = mergeFacilityPlaces([
    area({id: 99, routeName: "경부선"}),
    area({id: 2, routeName: "밀양울산선"}),
    area({id: 1, routeName: "함양울산선"}),
  ], [station({routeName: "함양울산선", latitude: 37.33})]);
  assert.equal(result.stations[0].linkedRestAreaId, 2);
});

test("방향 필드가 다르거나 비어 있어도 이름의 방향이 맞으면 연결한다", () => {
  for (const direction of ["시흥", null]) {
    for (const name of ["죽전(서울)주유소", "죽전（ 서울 방향 ）주유소"]) {
      const result = mergeFacilityPlaces([area()], [station({direction, name})]);
      assert.equal(result.stations[0].linkedRestAreaId, 1);
    }
  }
});

test("이름 방향 후보가 더 가까워도 방향 필드로 매칭되는 기존 후보를 우선한다", () => {
  const result = mergeFacilityPlaces([
    area({id: 1, latitude: 37.331}),
    area({id: 2, name: "죽전(부산 방향)", directionLabel: "부산 방향", latitude: 37.3305}),
  ], [station({name: "죽전(부산)주유소", direction: "서울"})]);
  assert.equal(result.stations[0].linkedRestAreaId, 1);
});

test("이름 방향 보조 매칭에서도 명칭·노선·거리·좌표 조건을 유지한다", () => {
  for (const candidate of [
    station({direction: "시흥", name: "다른(서울)주유소"}),
    station({direction: "시흥", routeName: "중부선"}),
    station({direction: "시흥", latitude: 38}),
    station({direction: "시흥", longitude: null}),
    station({direction: "시흥", name: "죽전주유소"}),
  ]) assert.equal(mergeFacilityPlaces([area()], [candidate]).stations[0].linkedRestAreaId, null);
});

test("이천(남이)는 이천 휴게소에 연결하고 마장은 마장복합(상) 연결을 유지한다", () => {
  const result = mergeFacilityPlaces([
    area({id: 175, name: "마장(양방향)", routeName: "중부선", directionLabel: "양방향", latitude: 37.2638, longitude: 127.407}),
    area({id: 8, name: "이천(남이 방향)", routeName: "중부선", directionLabel: "남이 방향", latitude: 37.2646, longitude: 127.404}),
  ], [
    station({id: 1324, siteCode: "0352|B00120|통영|AD", name: "이천(남이)주유소", routeName: "중부선", direction: "통영", latitude: 37.2646114, longitude: 127.4038441}),
    station({id: 1328, siteCode: "0352|B00187|하남|SK", name: "마장복합(상)주유소", routeName: "중부선", direction: "하남", latitude: 37.2635349, longitude: 127.4075671}),
  ]);
  assert.equal(result.stations.find(item => item.id === 1324)?.linkedRestAreaId, 8);
  assert.equal(result.stations.find(item => item.id === 1328)?.linkedRestAreaId, 175);
});

test("양방향 휴게소는 양쪽 방향 주유소를 연결하되 이름·노선·거리 검증을 유지한다", () => {
  for (const direction of ["양방향", "통합", "양방"]) {
    const result = mergeFacilityPlaces(
      [area({name: "죽전(양방향)", directionLabel: direction, routeDirection: direction})],
      [
        station({siteCode: "seoul"}),
        station({siteCode: "busan", name: "죽전(부산)주유소", direction: "부산"}),
        station({siteCode: "far", latitude: 37.34}),
        station({siteCode: "route", routeName: "중부선"}),
        station({siteCode: "name", name: "다른 주유소"}),
        station({siteCode: "unknown", direction: null}),
      ],
    );
    assert.deepEqual(result.stations.filter(item => item.linkedRestAreaId === 1).map(item => item.siteCode), ["busan", "seoul"]);
  }
});

test("검증된 원천 코드만 명칭 차이·방향 누락을 허용하고 노선·거리·양방향 검증은 유지한다", () => {
  for (const verified of verifiedRestAreaStations) {
    const rest = area({name: `${verified.restName}(양방향)`, routeName: verified.routeName, directionLabel: "양방향"});
    const fuel = station({siteCode: verified.sourceKey, name: "원천의 다른 이름", routeName: verified.routeName, direction: null});
    assert.equal(mergeFacilityPlaces([rest], [fuel]).stations[0].linkedRestAreaId, 1);
    for (const changed of [
      {...fuel, latitude: 38}, {...fuel, routeName: "다른 노선"}, {...fuel, siteCode: "unknown"},
    ]) assert.equal(mergeFacilityPlaces([rest], [changed]).stations[0].linkedRestAreaId, null);
    assert.equal(mergeFacilityPlaces([{...rest, directionLabel: "서울"}], [fuel]).stations[0].linkedRestAreaId, null);
    assert.equal(mergeFacilityPlaces([{...rest, name: "다른휴게소(양방향)"}], [fuel]).stations[0].linkedRestAreaId, null);
  }
});
