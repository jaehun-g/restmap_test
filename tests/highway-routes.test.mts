import test from "node:test";
import assert from "node:assert/strict";
import { normalizeHighwayRoute, parseHighwayRoute, validateHighwayRouteName, type HighwayRoute } from "../lib/highway-routes.ts";

function route(): HighwayRoute {
  return {
    id: 1, routeName: "경부선", routeNumber: "1",
    bounds: { south: 36, west: 127, north: 37, east: 128 },
    paths: [[[36, 127], [36.2, 127.2]], [[36.8, 127.8], [37, 128]]],
  };
}
function row() {
  const value = route();
  return {
    id: 1, route_name: Buffer.from(value.routeName), route_number: Buffer.from("1"),
    sw_lat: "36.0000000", sw_lng: "127.0000000", ne_lat: "37.0000000", ne_lng: "128.0000000",
    path_coordinates: Buffer.from(JSON.stringify(value.paths)),
  };
}

test("DB UTF-8 buffers and decimal strings become numeric, separate latitude-longitude paths", () => {
  const result = normalizeHighwayRoute(row());
  assert.ok(result.ok);
  assert.deepEqual(result.value, route());
});

test("PostgreSQL jsonb path coordinates are accepted after pg decodes them", () => {
  const result = normalizeHighwayRoute({...row(), path_coordinates: route().paths});
  assert.ok(result.ok);
  assert.deepEqual(result.value, route());
});

test("corrupt JSON, numeric line breaks and malformed UTF-8 are rejected without repair", () => {
  for (const path_coordinates of [
    Buffer.from("[[[37.\n1,127],[37.2,127.2]]]"),
    Buffer.from("not JSON"), Buffer.from([0xff]),
  ]) {
    const result = normalizeHighwayRoute({ ...row(), path_coordinates });
    assert.equal(result.ok, false);
    if (!result.ok) assert.equal(result.error.code, "HIGHWAY_ROUTE_DATA_INVALID");
  }
});

test("empty and flattened paths, invalid coordinates and short segments fail validation", () => {
  for (const paths of [
    [], [[36, 127], [37, 128]], [[[36, 127]]],
    [[[127, 36], [128, 37]]], [[[NaN, 127], [37, 128]]],
    [[[36, "127"], [37, 128]]], [[[36, 127, 0], [37, 128]]],
  ]) assert.equal(parseHighwayRoute({ ...route(), paths }).ok, false);
});

test("stored bounds must be finite and ordered", () => {
  for (const bounds of [
    { south: 37, west: 127, north: 36, east: 128 },
    { south: 36, west: 128, north: 37, east: 127 },
    { south: null, west: 127, north: 37, east: 128 },
    { south: 36, west: 127, north: Infinity, east: 128 },
  ]) assert.equal(parseHighwayRoute({ ...route(), bounds }).ok, false);
  assert.equal(normalizeHighwayRoute({ ...row(), sw_lat: null }).ok, false);
});

test("paths derive display bounds when stored bounds exclude route coordinates", () => {
  const result = parseHighwayRoute({
    ...route(),
    bounds: { south: 36.01, west: 127.01, north: 36.99, east: 127.99 },
  });
  assert.ok(result.ok);
  assert.deepEqual(result.value.bounds, { south: 36, west: 127, north: 37, east: 128 });
});

test("route identity is required while route numbers may be missing or shared", () => {
  assert.equal(parseHighwayRoute({ ...route(), routeNumber: null }).ok, true);
  for (const value of [{ ...route(), id: 0 }, { ...route(), routeName: "" }, { ...route(), routeNumber: 1 }])
    assert.equal(parseHighwayRoute(value).ok, false);
  assert.equal(parseHighwayRoute({ ...route(), routeName: "중부선", routeNumber: "35" }).ok, true);
  assert.equal(parseHighwayRoute({ ...route(), routeName: "대전통영선", routeNumber: "35" }).ok, true);
});

test("query names are trimmed and invalid names are rejected", () => {
  assert.deepEqual(validateHighwayRouteName(" 경부선 "), { ok: true, value: "경부선" });
  for (const value of [null, "", "   ", "가".repeat(101), "경부\n선", 1])
    assert.equal(validateHighwayRouteName(value).ok, false);
});
