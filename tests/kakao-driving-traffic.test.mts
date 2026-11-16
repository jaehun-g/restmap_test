import test from "node:test";
import assert from "node:assert/strict";
import {createDrivingRouteLayer} from "../lib/kakao-driving-route.ts";
import type {DrivingRoute} from "../lib/directions.ts";
import type {KakaoMap, KakaoMaps} from "../lib/kakao-sdk.ts";

test("선택된 경로에 구간별 교통 색상을 그리고 경로 변경 시 이전 선을 제거한다", () => {
  const lines: Array<{options: Record<string, unknown>; removed: boolean}> = [];
  class Polyline {
    line: (typeof lines)[number];
    constructor(options: Record<string, unknown>) { this.line = {options, removed: false}; lines.push(this.line); }
    setMap(map: unknown) { if (map === null) this.line.removed = true; }
    setOptions(options: Record<string, unknown>) { Object.assign(this.line.options, options); }
  }
  class LatLng {
    latitude: number;
    longitude: number;
    constructor(latitude: number, longitude: number) { this.latitude = latitude; this.longitude = longitude; }
  }
  let level = 10;
  let zoomListener: (() => void) | undefined;
  const sdk = {Polyline, LatLng, event: {
    addListener(_target: unknown, name: string, listener: () => void) { if (name === "zoom_changed") zoomListener = listener; },
    removeListener(_target: unknown, name: string) { if (name === "zoom_changed") zoomListener = undefined; },
  }} as unknown as KakaoMaps;
  const layer = createDrivingRouteLayer(sdk, {getLevel: () => level} as KakaoMap);
  const route: DrivingRoute = {
    id: "route", label: "추천", summaryRoad: null, distanceMeters: 100, durationSeconds: 10,
    bounds: {south: 37, north: 37.2, west: 127, east: 127.2},
    path: [[37, 127], [37.1, 127.1], [37.2, 127.2]],
    trafficSegments: [
      {path: [[37, 127], [37.1, 127.1]], state: 1, speed: 10},
      {path: [[37.1, 127.1], [37.2, 127.2]], state: 4, speed: 80},
    ],
  };
  layer.update([route]);
  assert.deepEqual(lines.map(line => line.options.strokeColor), ["#ffffff", "#64748b", "#dc2626", "#16a34a"]);
  assert.deepEqual(lines.map(line => line.options.strokeWeight), [11, 7, 7, 7]);
  level = 3;
  zoomListener?.();
  assert.deepEqual(lines.map(line => line.options.strokeWeight), [16, 12, 12, 12]);
  layer.update([]);
  assert.ok(lines.every(line => line.removed));
  layer.dispose();
  assert.equal(zoomListener, undefined);
});
