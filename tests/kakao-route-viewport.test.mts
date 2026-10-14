import test from "node:test";
import assert from "node:assert/strict";
import { createHighwayRouteViewport } from "../lib/kakao-route-viewport.ts";
import type { HighwayRoute } from "../lib/highway-routes.ts";
import { normalizeRestAreas } from "../lib/rest-areas.ts";
import type { KakaoMap, KakaoMaps, KakaoLatLng, KakaoBounds } from "../lib/kakao-sdk.ts";

function route(routeName = "경부선"): HighwayRoute {
  return { id: 1, routeName, routeNumber: "1", bounds: { south: 35, west: 127, north: 37, east: 129 }, paths: [[[35, 127], [37, 129]]] };
}
function areas() {
  const result = normalizeRestAreas([
    { id: 1, name: "가까운 휴게소", route_name: "경부선", latitude: 37.01, longitude: 127 },
    { id: 2, name: "먼 휴게소", route_name: "경부선", latitude: 35, longitude: 128 },
    { id: 3, name: "좌표 없는 휴게소", route_name: "경부선" },
  ]);
  assert.ok(result.ok);
  return result.value;
}
function mockKakao() {
  class LatLng implements KakaoLatLng {
    latitude: number; longitude: number;
    constructor(latitude: number, longitude: number) { this.latitude = latitude; this.longitude = longitude; }
    getLat() { return this.latitude; } getLng() { return this.longitude; }
  }
  class Bounds implements KakaoBounds {
    points: KakaoLatLng[] = [];
    extend(point: KakaoLatLng) { this.points.push(point); }
    getSouthWest() { return new LatLng(Math.min(...this.points.map((point) => point.getLat())), Math.min(...this.points.map((point) => point.getLng()))); }
    getNorthEast() { return new LatLng(Math.max(...this.points.map((point) => point.getLat())), Math.max(...this.points.map((point) => point.getLng()))); }
  }
  const fitted: KakaoBounds[] = [];
  const centers: KakaoLatLng[] = [];
  const levels: number[] = [];
  const sdk = { LatLng, LatLngBounds: Bounds } as unknown as KakaoMaps;
  const map = {
    setBounds(bounds: KakaoBounds) { fitted.push(bounds); },
    setCenter(center: KakaoLatLng) { centers.push(center); },
    setLevel(level: number) { levels.push(level); },
  } as unknown as KakaoMap;
  return { view: createHighwayRouteViewport(sdk, map), fitted, centers, levels };
}

test("route selection fits the full highway and rest areas beyond its bounds", () => {
  const { view, fitted } = mockKakao();
  view.update("경부선", route(), areas());
  assert.equal(fitted.length, 1);
  assert.deepEqual([fitted[0].getSouthWest().getLat(), fitted[0].getSouthWest().getLng()], [35, 127]);
  assert.deepEqual([fitted[0].getNorthEast().getLat(), fitted[0].getNorthEast().getLng()], [37.01, 129]);
});

test("routes with no matching rest areas still fit the route bounds", () => {
  const { view, fitted } = mockKakao();
  view.update("경부선", route(), []);
  assert.equal(fitted.length, 1);
  assert.equal(fitted[0].getNorthEast().getLat(), 37);
});

test("loading or failed route queries fit rest areas once and successful recovery fits the route", () => {
  const { view, fitted } = mockKakao();
  view.update("경부선", null, areas());
  view.update("경부선", null, [...areas()]);
  assert.equal(fitted.length, 1);
  view.update("경부선", route(), areas());
  assert.equal(fitted.length, 2);
  view.update("경부선", route(), []);
  assert.equal(fitted.length, 2);
});

test("changing, clearing and reselecting routes fits only the current selection", () => {
  const { view, fitted } = mockKakao();
  view.update("경부선", route(), []);
  view.update("영동선", route("경부선"), []);
  assert.equal(fitted.length, 1);
  view.update("영동선", route("영동선"), []);
  assert.equal(fitted.length, 2);
  view.update(null, null, areas());
  assert.equal(fitted.length, 2);
  view.update("영동선", route("영동선"), []);
  assert.equal(fitted.length, 3);
  view.update("영동선", route("영동선"), [], undefined, true);
  assert.equal(fitted.length, 4);
});

test("a single fallback result uses the existing marker zoom and empty results leave the camera alone", () => {
  const { view, fitted, centers, levels } = mockKakao();
  view.update("경부선", null, []);
  view.update("경부선", null, [areas()[0]]);
  assert.equal(fitted.length, 0);
  assert.equal(centers.length, 1);
  assert.equal(centers[0].getLat(), 37.01);
  assert.deepEqual(levels, [6]);
});
