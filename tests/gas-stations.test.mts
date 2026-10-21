import test from "node:test";
import assert from "node:assert/strict";
import {normalizeGasStations, stationHours} from "../lib/gas-stations.ts";
import {canKeepPreviousStations, parseStationQuery, stationQueryString} from "../lib/gas-station-query.ts";
import {
  validateStationUpdate,
  validateStationCoordinatePair,
} from "../lib/gas-station-validation.ts";
import {createStationDraft, stationRequestFromDraft} from "../lib/gas-station-editor.ts";
import {filterStations, restPlace, stationPlace, placeSummary} from "../lib/map-places.ts";
import {normalizeRestAreas} from "../lib/rest-areas.ts";

const row = () => ({
  id: 1,
  siteCd: "000123",
  siteNm: "GS 휴게소 주유소",
  lat: "37.1234567891",
  longi: "127.1234567891",
  cargoYn: "Y",
  cvsYn: "N",
  selfYn: null,
  businsFrTm: "0000",
  businsToTm: "0000",
});
const revision = "a".repeat(64);
function station() {
  const result = normalizeGasStations([row()]);
  assert.ok(result.ok);
  return result.value[0];
}

test("UTF-8 buffers, ten-decimal coordinates and Y/N/NULL flags normalize without losing station codes", () => {
  const result = normalizeGasStations([
    {
      ...row(),
      siteCd: Buffer.from("000123"),
      siteNm: Buffer.from("서울 주유소"),
      lat: Buffer.from("37.1234567891"),
      cargoYn: Buffer.from("Y"),
    },
  ]);
  assert.ok(result.ok);
  assert.equal(result.value[0].siteCode, "000123");
  assert.equal(result.value[0].name, "서울 주유소");
  assert.equal(result.value[0].latitude, 37.1234567891);
  assert.equal(result.value[0].services.cargo, true);
  assert.equal(result.value[0].services.convenience, false);
  assert.equal(result.value[0].services.self, null);
});
test("missing, partial and invalid coordinates stay unmapped; duplicate identifiers fail", () => {
  for (const coordinate of [null, "", "invalid", 91]) {
    const result = normalizeGasStations([{...row(), lat: coordinate}]);
    assert.ok(result.ok);
    assert.equal(result.value[0].latitude, null);
    assert.equal(result.value[0].longitude, null);
  }
  assert.equal(normalizeGasStations([row(), {...row(), id: 2}]).ok, false);
  assert.equal(normalizeGasStations([{...row(), siteNm: Buffer.from([255])}]).ok, false);
});
test("ambiguous equal opening and closing times do not claim 24-hour operation", () => {
  assert.match(stationHours(station()), /확인 필요/);
  assert.equal(stationHours({openTime: "0700", closeTime: "2200"}), "07:00–22:00");
  assert.equal(stationHours({openTime: null, closeTime: null}), "영업시간 정보 없음");
});
test("station search uses all terms and service filters with AND", () => {
  assert.equal(filterStations([station()], "GS 주유소", ["cargo"]).length, 1);
  assert.equal(filterStations([station()], "GS", ["cargo", "convenience"]).length, 0);
  assert.equal(filterStations([station()], "없는 주소", []).length, 0);
});
test("map identities and cluster composition distinguish equal numeric IDs and count lounges as a rest-area subset", () => {
  const rest = normalizeRestAreas([{id: 1, name: "휴게소", has_truck_lounge: 1}]);
  assert.ok(rest.ok);
  const places = [restPlace(rest.value[0]), stationPlace(station())];
  assert.notEqual(places[0].key, places[1].key);
  assert.deepEqual(placeSummary(places), {total: 2, rest: 1, station: 1, lounge: 1});
});
test("query parsing supports all, radius and dateline bounds while route selection takes priority in the client", () => {
  assert.equal(parseStationQuery(new URLSearchParams()).ok, true);
  const scope = {
    kind: "radius" as const,
    center: {latitude: 37, longitude: 127},
    radiusMeters: 15000,
    referenceLevel: 9,
  };
  const key = stationQueryString("경부선", scope);
  const parsed = parseStationQuery(new URLSearchParams(key));
  assert.ok(parsed.ok);
  assert.equal(parsed.value.routeName, "경부선");
  assert.equal(parsed.value.scope.kind, "all");
  assert.equal(parseStationQuery(new URLSearchParams(stationQueryString(null, scope))).ok, true);
  assert.deepEqual(parseStationQuery(new URLSearchParams(stationQueryString(null, {kind: "all"}, "ex"))), {
    ok: true,
    value: {routeName: null, scope: {kind: "all"}, source: "ex"},
  });
  assert.equal(
    parseStationQuery(new URLSearchParams("south=-10&north=10&west=170&east=-170")).ok,
    true,
  );
});
test("partial, duplicate, mixed and invalid query parameters fail before DB access", () => {
  for (const query of [
    "south=37",
    "latitude=&longitude=127&radiusMeters=2000",
    "latitude=91&longitude=127&radiusMeters=2000",
    "latitude=37&longitude=127&radiusMeters=0",
    "south=38&north=37&west=126&east=128",
    "routeName=&",
    "routeName=A&south=37",
    "latitude=37&latitude=38",
    "table=test_lounge",
  ])
    assert.equal(parseStationQuery(new URLSearchParams(query)).ok, false, query);
});
test("map scope changes retain the previous EX station result but route changes do not", () => {
  const near = "source=ex&latitude=37&longitude=127&radiusMeters=15000";
  const zoomed = "source=ex&latitude=37&longitude=127&radiusMeters=30000";
  assert.equal(canKeepPreviousStations(near, zoomed), true);
  assert.equal(canKeepPreviousStations(near, "source=ex&routeName=%EA%B2%BD%EB%B6%80%EC%84%A0"), false);
  assert.equal(canKeepPreviousStations("source=ex&routeName=%EA%B2%BD%EB%B6%80%EC%84%A0", near), false);
  assert.equal(canKeepPreviousStations(near, "source=all&latitude=37&longitude=127&radiusMeters=30000"), false);
});
test("editor preserves invalid numbers and submits only changed whitelisted fields", () => {
  const original = station(),
    draft = createStationDraft(original);
  draft.values.name = "새 주유소";
  draft.services.cargo = false;
  const request = stationRequestFromDraft(original, revision, draft);
  assert.ok(request.ok);
  assert.deepEqual(request.value.changes, {name: "새 주유소", services: {cargo: false}});
  draft.values.latitude = "invalid";
  assert.equal(stationRequestFromDraft(original, revision, draft).ok, false);
});
test("server validation rejects readonly fields, overlength text, invalid times and mismatched coordinates", () => {
  for (const changes of [
    {id: 2},
    {siteCode: "new"},
    {sourceDetails: {}},
    {kakaoPayYn: "Y"},
    {name: ""},
    {name: "a".repeat(151)},
    {name: "🚚"},
    {openTime: "2400"},
    {closeTime: "1260"},
    {latitude: 37.12345678912},
    {services: {unknown: true}},
  ])
    assert.equal(validateStationUpdate({changes, expectedRevision: revision}).ok, false);
  assert.equal(
    validateStationUpdate({
      changes: {latitude: 37.1234567891, services: {cargo: null}},
      expectedRevision: revision,
    }).ok,
    true,
  );
  assert.equal(validateStationCoordinatePair(station(), {latitude: null}).ok, false);
  assert.equal(
    validateStationCoordinatePair(station(), {latitude: null, longitude: null}).ok,
    true,
  );
});
