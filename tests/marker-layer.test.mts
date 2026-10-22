import test from "node:test";
import assert from "node:assert/strict";
import {markerLayerSignature} from "../lib/marker-layer.ts";
import type {MapPlace} from "../lib/map-places.ts";

const place = (name = "휴게소") =>
  ({
    kind: "rest",
    key: "rest:1",
    record: {name, latitude: 37, longitude: 127, facilities: {has_truck_lounge: false}},
  }) as unknown as MapPlace;

test("equivalent place arrays keep the same marker-layer signature", () => {
  assert.equal(markerLayerSignature([place()]), markerLayerSignature([place()]));
  assert.notEqual(markerLayerSignature([place()]), markerLayerSignature([place("다른 휴게소")]));
});

test("음식·유가 메타데이터 변경과 마커의 위치·외형 변경을 구분한다", () => {
  const first = place();
  const updated = structuredClone(first);
  if (updated.kind !== "rest") throw new Error("Expected rest area");
  updated.record.foodMenuSummary = {count: 1, collectedAt: null, featured: []};
  assert.equal(markerLayerSignature([first]), markerLayerSignature([updated]));
  updated.record.latitude = 38;
  assert.notEqual(markerLayerSignature([first]), markerLayerSignature([updated]));
});
