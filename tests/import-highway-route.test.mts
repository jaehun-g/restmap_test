import assert from "node:assert/strict";
import test from "node:test";
import {routeFromGeoJson} from "../scripts/import-highway-route.mjs";

test("GeoJSON longitude-latitude paths become display latitude-longitude paths and bounds", () => {
  const route = routeFromGeoJson({
    type: "FeatureCollection",
    features: [
      {
        type: "Feature",
        geometry: {type: "LineString", coordinates: [[126.7123456, 37.2123456], [126.8, 37.3]]},
        properties: {},
      },
      {
        type: "Feature",
        geometry: {type: "MultiLineString", coordinates: [[[128, 37.4], [128.1, 37.5]]]},
        properties: {},
      },
    ],
  });

  assert.deepEqual(route.paths, [[[37.21235, 126.71235], [37.3, 126.8]], [[37.4, 128], [37.5, 128.1]]]);
  assert.deepEqual(route.bounds, {south: 37.21235, west: 126.71235, north: 37.5, east: 128.1});
});

test("invalid or underspecified GeoJSON lines are rejected before a database update", () => {
  assert.throws(() => routeFromGeoJson({type: "FeatureCollection", features: []}));
  assert.throws(() => routeFromGeoJson({
    type: "FeatureCollection",
    features: [{type: "Feature", geometry: {type: "LineString", coordinates: [[127, 37]]}, properties: {}}],
  }));
});
