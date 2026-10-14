import test from "node:test";
import assert from "node:assert/strict";
import { createHighwayRouteLayer } from "../lib/kakao-highway-route.ts";
import type { HighwayRoute } from "../lib/highway-routes.ts";
import type { KakaoMap, KakaoMaps, KakaoLatLng } from "../lib/kakao-sdk.ts";

function route(): HighwayRoute {
  return { id: 1, routeName: "경부선", routeNumber: "1", bounds: { south: 36, west: 127, north: 37, east: 128 }, paths: [[[36, 127], [36.2, 127.2]], [[36.8, 127.8], [37, 128]]] };
}
function mockKakao() {
  class LatLng implements KakaoLatLng {
    latitude: number; longitude: number;
    constructor(latitude: number, longitude: number) { this.latitude = latitude; this.longitude = longitude; }
    getLat() { return this.latitude; } getLng() { return this.longitude; }
  }
  type Options = ConstructorParameters<KakaoMaps["Polyline"]>[0];
  const lines: Polyline[] = [];
  class Polyline {
    options: Options; map: KakaoMap | null;
    constructor(options: Options) { this.options = options; this.map = options.map; lines.push(this); }
    setMap(map: KakaoMap | null) { this.map = map; }
  }
  const map = new Proxy({}, { get() { throw new Error("Highlight must not move the camera or access markers."); } }) as KakaoMap;
  const sdk = { LatLng, Polyline } as unknown as KakaoMaps;
  return { sdk, map, lines };
}

test("latitude-longitude order and disconnected paths are preserved without joining endpoints", () => {
  const { sdk, map, lines } = mockKakao();
  const layer = createHighwayRouteLayer(sdk, map);
  layer.update(route());
  assert.equal(lines.length, 2);
  for (const line of lines) {
    assert.equal(line.map, map);
    assert.deepEqual(line.options.path.map(path => path.map(point => [point.getLat(), point.getLng()])), route().paths);
  }
  assert.equal(lines[0].options.strokeWeight, 9);
  assert.equal(lines[0].options.strokeColor, "#ffffff");
  assert.equal(lines[1].options.strokeWeight, 5);
  assert.equal(lines[1].options.strokeColor, "#0865ff");
  assert.ok(lines.every(line => line.options.zIndex < 1));
});

test("changing and clearing routes removes both previous lines and repeated updates do not duplicate them", () => {
  const { sdk, map, lines } = mockKakao();
  const layer = createHighwayRouteLayer(sdk, map);
  const first = route();
  layer.update(first);
  layer.update(first);
  assert.equal(lines.length, 2);
  layer.update({ ...route(), id: 2, routeName: "영동선" });
  assert.ok(lines.slice(0, 2).every(line => line.map === null));
  assert.ok(lines.slice(2).every(line => line.map === map));
  layer.update(null);
  assert.ok(lines.every(line => line.map === null));
});

test("map cleanup detaches the overlay and prevents later updates from drawing on the old map", () => {
  const { sdk, map, lines } = mockKakao();
  const layer = createHighwayRouteLayer(sdk, map);
  layer.update(route());
  layer.dispose();
  layer.dispose();
  layer.update(route());
  assert.equal(lines.length, 2);
  assert.ok(lines.every(line => line.map === null));
});
