import test from "node:test";
import assert from "node:assert/strict";
import {normalizeRestAreas} from "../lib/rest-areas.ts";
import {normalizeExGasStations} from "../lib/ex-gas-stations.ts";
import {planStationCoordinateCorrections} from "../lib/station-coordinate-corrections.ts";

const parsedAreas = normalizeRestAreas([{id: 1, name: "옥산(부산 방향)", route_name: "경부선", direction_label: "부산 방향", latitude: 36.6577, longitude: 127.37}]);
const parsedStations = normalizeExGasStations([{id: 5, source_key: "test", service_area_name: "옥산(부산)주유소", route_name: "경부선", direction: "부산", latitude: 37, longitude: 128}]);
assert.ok(parsedAreas.ok && parsedStations.ok);
const area = parsedAreas.value[0];
const station = parsedStations.value[0];

test("거리만 실패한 동명·동방향·동일 노선의 유일 후보를 선택한다", () => {
  for (const direction of ["부산", "통영", null]) {
    const plans = planStationCoordinateCorrections([area], [{...station, direction}]);
    assert.equal(plans.length, 1);
    assert.equal(plans[0].area.id, area.id);
    assert.ok(plans[0].distance > 300);
  }
});

test("노선·명칭·방향·좌표 실패 또는 복수 후보이면 보정하지 않는다", () => {
  for (const candidate of [
    {...station, routeName: "중부선"},
    {...station, name: "다른(부산)주유소"},
    {...station, name: "옥산(서울)주유소", direction: "서울"},
    {...station, latitude: null},
  ]) assert.equal(planStationCoordinateCorrections([area], [candidate]).length, 0);
  assert.equal(planStationCoordinateCorrections([area, {...area, id: 2}], [station]).length, 0);
});

test("이미 다른 휴게소에 연결된 주유소와 거리 이내 시설은 이동하지 않는다", () => {
  const nearby = {...station, latitude: area.latitude, longitude: area.longitude};
  assert.equal(planStationCoordinateCorrections([area], [nearby]).length, 0);
  assert.equal(planStationCoordinateCorrections([area, {...area, id: 2, latitude: station.latitude, longitude: station.longitude}], [station]).length, 0);
});
