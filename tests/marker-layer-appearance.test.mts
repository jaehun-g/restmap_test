import test from "node:test";
import assert from "node:assert/strict";
import {markerLayerSignature} from "../lib/marker-layer.ts";
import type {MapPlace} from "../lib/map-places.ts";

function place(hasTruckLounge: boolean): MapPlace {
  return {
    kind: "rest",
    key: "rest:1",
    record: {
      name: "test",
      latitude: 37,
      longitude: 127,
      facilities: {has_truck_lounge: hasTruckLounge},
    },
  } as unknown as MapPlace;
}

test("marker-layer signature changes when marker appearance changes", () => {
  assert.notEqual(markerLayerSignature([place(false)]), markerLayerSignature([place(true)]));
});
