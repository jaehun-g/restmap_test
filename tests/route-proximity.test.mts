import test from "node:test";
import assert from "node:assert/strict";
import { compileRouteProximity, expandedBounds } from "../lib/route-proximity.ts";
import type { HighwayRoute } from "../lib/highway-routes.ts";

function route(paths: HighwayRoute["paths"] = [[[35, 127], [36, 127]]]): HighwayRoute {
  return { id: 1, routeName: "경부선", routeNumber: "1", bounds: { south: 35, west: 127, north: 38, east: 127 }, paths };
}
test("proximity measures the middle of a segment, not only its vertices", () => {
  const near = compileRouteProximity(route());
  assert.equal(near({ latitude: 35.5, longitude: 127.01 }), true);
  assert.equal(near({ latitude: 35.5, longitude: 127.04 }), false);
});
test("the 2km boundary is inclusive and points beyond a segment use its endpoint distance", () => {
  const delta = 2000 / 6_371_008.8 * 180 / Math.PI;
  const near = compileRouteProximity(route());
  assert.equal(near({ latitude: 36 + delta, longitude: 127 }), true);
  assert.equal(near({ latitude: 36 + delta + 0.00001, longitude: 127 }), false);
  assert.equal(near({ latitude: 35 - delta, longitude: 127 }), true);
});
test("disconnected segments never create an imaginary connector across a gap", () => {
  const near = compileRouteProximity(route([[[35, 127], [35.1, 127]], [[37.9, 127], [38, 127]]]));
  assert.equal(near({ latitude: 36.5, longitude: 127 }), false);
  assert.equal(near({ latitude: 38, longitude: 127.001 }), true);
});
test("repeated vertices and conservative bounds preserve nearby candidates", () => {
  const near = compileRouteProximity(route([[[35, 127], [35, 127]]]));
  assert.equal(near({ latitude: 35, longitude: 127.01 }), true);
  assert.equal(near({ latitude: 35.1, longitude: 127 }), false);
  const bounds = expandedBounds({ south: 35, west: 127, north: 36, east: 128 }, 2000);
  assert.ok(bounds.south < 35 && bounds.north > 36 && bounds.west < 127 && bounds.east > 128);
});
