import test from "node:test";
import assert from "node:assert/strict";
import {nearestHighwayRoute} from "../lib/nearest-highway-route.ts";
import type {HighwayRoute, HighwayCoordinate} from "../lib/highway-routes.ts";

function route(id: number, paths: HighwayCoordinate[][]): HighwayRoute {
  return {
    id,
    routeName: `${id}선`,
    routeNumber: null,
    bounds: {south: 0, north: 90, west: 0, east: 180},
    paths,
  };
}

test("가장 가까운 정점이 아닌 실제 선분을 기준으로 노선을 선택한다", () => {
  const long = route(1, [
    [
      [37, 126],
      [37, 128],
    ],
  ]);
  const nearbyVertex = route(2, [
    [
      [37.1, 127],
      [37.2, 127],
    ],
  ]);
  assert.equal(nearestHighwayRoute({latitude: 37.001, longitude: 127}, [nearbyVertex, long]), long);
});

test("분리된 구간 사이에 가상의 선을 만들지 않는다", () => {
  const separated = route(1, [
    [
      [37, 126],
      [37, 126.1],
    ],
    [
      [37, 127.9],
      [37, 128],
    ],
  ]);
  const near = route(2, [
    [
      [37.1, 126.9],
      [37.1, 127.1],
    ],
  ]);
  assert.equal(nearestHighwayRoute({latitude: 37, longitude: 127}, [separated, near]), near);
});

test("노선이 없으면 선택하지 않고 길이가 0인 선분도 처리한다", () => {
  const point = {latitude: 37, longitude: 127};
  assert.equal(nearestHighwayRoute(point, []), null);
  const duplicate = route(1, [
    [
      [37, 127],
      [37, 127],
    ],
  ]);
  assert.equal(nearestHighwayRoute(point, [duplicate]), duplicate);
});
