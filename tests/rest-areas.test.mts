import test from "node:test";
import assert from "node:assert/strict";
import { facilityDefinitions, hasCoordinates, normalizeRestAreas, nullableBoolean } from "../lib/rest-areas.ts";

const row = { id: 1, name: "테스트 휴게소", latitude: "37.1234567", longitude: "127.7654321" };

test("Cafe24 binary-collation UTF-8 text fields decode to Korean strings", () => {
  const result = normalizeRestAreas([{ ...row, name: Buffer.from("테스트 휴게소"), route_name: Buffer.from("경부고속도로"), direction_label: Buffer.from("서울 방향"), phone: Buffer.from("02-123-4567") }]);
  if (!result.ok) assert.fail(result.error.message);
  assert.equal(result.value[0].name, "테스트 휴게소");
  assert.equal(result.value[0].routeName, "경부고속도로");
  assert.equal(result.value[0].directionLabel, "서울 방향");
  assert.equal(result.value[0].phone, "02-123-4567");
  assert.equal(normalizeRestAreas([{ ...row, name: Buffer.from([0xff]) }]).ok, false);
});

test("MariaDB DECIMAL strings retain seven decimal places", () => {
  const result = normalizeRestAreas([row]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value[0].latitude, 37.1234567);
  assert.equal(result.value[0].longitude, 127.7654321);
  assert.equal(hasCoordinates(result.value[0]), true);
});

test("NULL, blank, partial, non-finite and out-of-range coordinates are unmapped", () => {
  for (const values of [
    { latitude: null, longitude: null },
    { latitude: "", longitude: "127" },
    { latitude: "37", longitude: undefined },
    { latitude: "not a coordinate", longitude: "127" },
    { latitude: Infinity, longitude: "127" },
    { latitude: 91, longitude: 127 },
    { latitude: 37, longitude: 181 },
  ]) {
    const result = normalizeRestAreas([{ ...row, ...values }]);
    assert.equal(result.ok, true);
    if (!result.ok) return;
    assert.equal(hasCoordinates(result.value[0]), false);
    assert.equal(result.value[0].latitude, null);
    assert.equal(result.value[0].longitude, null);
  }
});

test("zero coordinates are preserved instead of treated as missing", () => {
  const result = normalizeRestAreas([{ ...row, latitude: 0, longitude: 0 }]);
  assert.equal(result.ok, true);
  if (result.ok) assert.equal(hasCoordinates(result.value[0]), true);
});

test("facility values distinguish available, unavailable and unknown", () => {
  assert.equal(nullableBoolean(1), true);
  assert.equal(nullableBoolean("1"), true);
  assert.equal(nullableBoolean(0), false);
  assert.equal(nullableBoolean("0"), false);
  for (const value of [null, undefined, "", 2, "yes"]) assert.equal(nullableBoolean(value), null);
  const result = normalizeRestAreas([{ ...row, has_shower: 0, has_ev_charger: 1 }]);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.value[0].facilities.has_shower, false);
  assert.equal(result.value[0].facilities.has_ev_charger, true);
  assert.equal(result.value[0].facilities.has_sleeping_room, null);
  assert.equal(Object.keys(result.value[0].facilities).length, facilityDefinitions.length);
});

test("parking count preserves zero and treats negative or fractional counts as unknown", () => {
  for (const [input, expected] of [[0, 0], ["120", 120], [null, null], [-1, null], [2.5, null]] as const) {
    const result = normalizeRestAreas([{ ...row, parking_count: input }]);
    if (!result.ok) assert.fail(result.error.message);
    assert.equal(result.value[0].parkingCount, expected);
  }
});

test("route and phone values survive mapping and blanks become null", () => {
  const result = normalizeRestAreas([{ ...row, phone: " 010-1234-5678 ", route_name: "경부", route_number: "01", route_direction: "상행", direction_label: "서울 방향", rest_area_type: "일반", has_truck_lounge: null }]);
  if (!result.ok) assert.fail(result.error.message);
  assert.equal(result.value[0].phone, "010-1234-5678");
  assert.equal(result.value[0].routeNumber, "01");
  assert.equal(result.value[0].routeDirection, "상행");
  assert.equal(result.value[0].directionLabel, "서울 방향");
});

test("duplicate IDs, empty names and invalid primary keys report bad data", () => {
  assert.equal(normalizeRestAreas([row, row]).ok, false);
  assert.equal(normalizeRestAreas([{ ...row, name: " " }]).ok, false);
  assert.equal(normalizeRestAreas([{ ...row, id: -1 }]).ok, false);
});

test("an empty DB result remains an empty result", () => {
  assert.deepEqual(normalizeRestAreas([]), { ok: true, value: [] });
});
